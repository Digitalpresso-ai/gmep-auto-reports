import json
import os
import re
import fcntl
from functools import wraps
import signal
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from .contract import HarnessError, digest, file_hash, inventory, read_json, require, validate_plan
from . import reviewer


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        temporary = Path(stream.name)
    temporary.replace(path)


def exclusive(method):
    @wraps(method)
    def run(self, feature, *args, **kwargs):
        folder = self.folder(feature)
        require(folder.is_dir(), '먼저 작업을 init하세요')
        # The persistent inode avoids a race between closing and unlinking a lock.
        with (folder / '.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise HarnessError(f'작업 실행 중: {feature}. 같은 작업의 명령은 순서대로 실행하세요')
            return method(self, feature, *args, **kwargs)
    return run


class Harness:
    def __init__(self, root, codex='codex', developer_session=None, review_timeout=300, model=None, ignore_user_config=False):
        self.root = Path(root).resolve()
        self.codex = codex
        self.developer_session = developer_session or os.environ.get('CODEX_THREAD_ID') or 'local-' + uuid.uuid4().hex
        self.review_timeout = review_timeout
        self.model = model
        self.ignore_user_config = ignore_user_config

    def folder(self, feature):
        require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', feature), '잘못된 기능 ID')
        return self.root / '.proofstill/evidence' / feature

    def work(self, feature):
        return self.root / '.proofstill/work' / feature

    def load(self, feature):
        folder = self.folder(feature)
        return read_json(folder / 'plan.json'), read_json(folder / 'state.json')

    def save(self, plan, state):
        save_json(self.folder(plan['id']) / 'state.json', state)
        work = self.work(plan['id'])
        if work.is_dir():
            from .handoff import briefing
            (work / 'brief.md').write_text(briefing(self, plan['id']))

    def basis(self, plan):
        paths = [p for c in plan['checks'] for p in c['files']] + plan['context_files']
        return {'plan': plan, 'files': inventory(self.root, paths)}

    def criteria_digest(self, plan, state):
        require(digest(plan) == state['plan_digest'], '보관된 기준이 변경되었습니다')
        origin = Path(state['origin'])
        if origin.exists():
            current = validate_plan(self.root, read_json(origin))
            require(digest(current) == state['plan_digest'], '원래 기능 정의/명령이 변경되었습니다. 새 작업 ID로 기준을 재검토하세요')
        else:
            require(state.get('closed'), '원래 기능 정의가 사라졌습니다')
        basis = self.basis(plan)
        return digest({'basis': basis, 'decisions': state['decisions']}) if state.get('decisions') else digest(basis)

    def source_digest(self, plan):
        return digest(inventory(self.root, plan['sources']))

    def init(self, path):
        origin = Path(path).resolve()
        plan = validate_plan(self.root, read_json(origin))
        folder = self.folder(plan['id'])
        require(not folder.exists(), '이미 있는 작업 ID입니다. 기존 작업을 재개하거나 새 ID를 사용하세요')
        folder.mkdir(parents=True)
        save_json(folder / 'plan.json', plan)
        self.work(plan['id']).mkdir(parents=True, exist_ok=False)
        state = {'plan_digest': digest(plan), 'criteria_digest': digest(self.basis(plan)),
                 'origin': str(origin),
                 'developer_session': self.developer_session, 'runs': [], 'reviews': {},
                 'review_sessions': [], 'next': '구현 및 필요한 검사 실행', 'closed': False}
        self.save(plan, state)
        return plan['id']

    @staticmethod
    def latest(state, phase, check):
        return next((r for r in reversed(state['runs']) if r['phase'] == phase and r['check'] == check), None)

    def green_ready(self, plan, state):
        from .collaboration import require_decisions_resolved
        require_decisions_resolved(state)
        criteria = self.criteria_digest(plan, state)
        source = self.source_digest(plan)
        for check in plan['checks']:
            run = self.latest(state, 'green', check['id'])
            require(self.evidence_current(run) and run['accepted'] and run['criteria_digest'] == criteria and run['source_digest'] == source,
                    f"현재 버전의 Green이 필요합니다: {check['id']}")
            for trace in run.get('traces', []):
                require(file_hash(Path(trace['path'])) == trace['sha256'], '흐름 기록이 사라졌거나 변경되었습니다')
        return criteria, source

    def execute(self, argv, timeout, input_text=None, cwd=None, environment=None):
        process = None
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
        env.update(environment or {})
        try:
            process = subprocess.Popen(argv, cwd=cwd or self.root, stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, start_new_session=True)
            try:
                stdout, stderr = process.communicate(input=input_text, timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                stdout, stderr = process.communicate()
                return {'exit_code': None, 'timed_out': True, 'stdout': stdout, 'stderr': stderr}
            return {'exit_code': process.returncode, 'timed_out': False, 'stdout': stdout, 'stderr': stderr}
        except OSError as error:
            return {'exit_code': None, 'timed_out': False, 'stdout': '', 'stderr': str(error)}
        except BaseException:
            if process and process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            raise

    @exclusive
    def run(self, feature, phase='green', kind=None, module=None):
        require(phase in ['red', 'green'], 'phase는 red/green이어야 합니다')
        plan, state = self.load(feature)
        from .collaboration import require_decisions_resolved
        require_decisions_resolved(state)
        criteria = self.criteria_digest(plan, state)
        selected = [c for c in plan['checks'] if (kind is None or c['kind'] == kind) and (module is None or c['module'] == module)]
        require(selected, '실행할 검사가 없습니다')
        if phase == 'red':
            require(not any(c['regression'] for c in selected), '기존 회귀 검사는 Green만 실행하세요')
            require(all(c.get('red_pattern') for c in selected), 'Red 실행에는 의도한 실패 패턴이 필요합니다')
        results = [self._run_check(plan, state, check, phase, criteria) for check in selected]
        state['next'] = f"{phase}: " + ('통과' if all(r['accepted'] for r in results) else '실패/미검증 — 근거 확인 후 수정')
        self.save(plan, state)
        return results

    @staticmethod
    def evidence_current(run):
        return bool(run and not run.get('pending') and
                    all(Path(run.get(key, '')).is_file() and run.get('evidence_hashes', {}).get(key) == file_hash(Path(run[key]))
                        for key in ['log', 'receipt']) and
                    all(file_hash(Path(t['path'])) == t['sha256'] for t in run.get('traces', [])))

    def _run_check(self, plan, state, check, phase, criteria):
        from .trace_check import verify_trace
        from .trace_view import write_trace_view
        folder = self.folder(plan['id']) / 'runs' / uuid.uuid4().hex[:12]
        folder.mkdir(parents=True)
        trace_dir = folder / 'traces'
        trace_dir.mkdir()
        source = self.source_digest(plan)
        record = {'check': check['id'], 'phase': phase, 'argv': check['argv'], 'module': check['module'],
                  'kind': check['kind'], 'cwd': str(self.root), 'accepted': False, 'pending': True,
                  'exit_code': None, 'timed_out': False, 'traces': [], 'criteria_digest': criteria,
                  'source_digest': source, 'log': str(folder / 'output.log'), 'receipt': str(folder / 'result.json'),
                  'recorded_at': datetime.now(timezone.utc).isoformat()}
        (folder / 'output.log').write_text('실행 시작. 결과는 아직 확인되지 않았습니다.\n')
        state['runs'].append(record)
        state['next'] = f"{check['id']} {phase} 실행 중"
        save_json(folder / 'result.json', record)
        self.save(plan, state)
        try:
            result = self.execute(check['argv'], check['timeout'], environment={'PROOFSTILL_TRACE_DIR': str(trace_dir)})
            (folder / 'output.log').write_text('STDOUT\n' + result['stdout'] + '\nSTDERR\n' + result['stderr'])
            record.update({k: v for k, v in result.items() if k not in ['stdout', 'stderr']})
            output = result['stdout'] + '\n' + result['stderr']
            expected_exit = result['exit_code'] == 0 if phase == 'green' else result['exit_code'] is not None and result['exit_code'] > 0
            accepted = expected_exit and not result['timed_out'] and bool(re.search(check[phase + '_pattern'], output))
            try:
                unchanged = self.criteria_digest(plan, state) == criteria and self.source_digest(plan) == source
            except HarnessError:
                unchanged = False
            expectation = read_json(self.root / check['trace_expectation']) if check.get('trace_expectation') else None
            for path in sorted(trace_dir.glob('*.jsonl')):
                verified = verify_trace(path, expectation)
                item = {'path': str(path), 'sha256': file_hash(path), 'html': None,
                        'valid': verified['valid'], 'issues': verified['issues'], 'steps': len(verified['steps']), 'name': verified['name']}
                if 'state_machine' in verified:
                    item['state_machine'] = verified['state_machine']
                record['traces'].append(item)
                item['html'] = str(write_trace_view(path, path.with_suffix('.html'), expectation))
            traces = record['traces']
            trace_ok = (not check.get('trace_expectation') or bool(traces)) and all(t['valid'] for t in traces)
            record.update(accepted=bool(accepted and unchanged and (phase == 'red' or trace_ok)), pending=False,
                          trace_issue='필수 흐름 기록이 없습니다' if check.get('trace_expectation') and not traces else None)
            return record
        except BaseException as error:
            record.update(accepted=False, pending=False, error={'type': type(error).__name__, 'message': str(error)})
            state['next'] = f"{check['id']} 실행 중단/실패: {type(error).__name__}"
            raise
        finally:
            save_json(folder / 'result.json', record)
            record['evidence_hashes'] = {key: file_hash(Path(record[key])) for key in ['log', 'receipt']}
            self.save(plan, state)

    @exclusive
    def review(self, feature, stage='implementation'):
        require(stage in ['criteria', 'implementation'], '알 수 없는 검토 단계')
        plan, state = self.load(feature)
        from .collaboration import require_decisions_resolved
        require_decisions_resolved(state)
        if stage == 'criteria':
            criteria = self.criteria_digest(plan, state)
            source = self.source_digest(plan)
        else:
            criteria, source = self.green_ready(plan, state)
        folder = self.folder(feature) / 'reviews' / (stage + '-' + uuid.uuid4().hex[:12])
        folder.mkdir(parents=True)
        manifest = folder / 'manifest.json'
        save_json(manifest, inventory(self.root, plan['sources'] + [p for c in plan['checks'] for p in c['files']] + plan['context_files']))
        packet = {'stage': stage, 'project_root': str(self.root), 'plan': plan,
                  'criteria_digest': criteria, 'source_digest': source,
                  'manifest': str(manifest), 'decisions': state.get('decisions', {})}
        record = {'passed': False, 'criteria_digest': criteria, 'source_digest': source,
                  'folder': str(folder), 'launcher': self.codex, 'model': self.model,
                  'ignore_user_config': self.ignore_user_config}
        previous = state['reviews'].get(stage)
        history = state.setdefault('review_history', [])
        if previous and not any(item.get('folder') == previous.get('folder') for item in history):
            history.append(dict(previous, stage=stage))
        state['reviews'][stage] = record
        record['stage'] = stage
        history.append(record)
        self.save(plan, state)
        try:
            session, answer = reviewer.launch(self, packet, folder)
            record.update(session=session, answer=answer)
            require(session != state['developer_session'] and session not in state['review_sessions'], '개발/이전 검토 세션을 재사용할 수 없습니다')
            state['review_sessions'].append(session)
            reviewer.validate_verdict(plan, answer)
            require(self.criteria_digest(plan, state) == criteria and self.source_digest(plan) == source, '리뷰 도중 기준/코드가 변경되었습니다')
            record['passed'] = True
            state['next'] = '구현 및 필요한 검사 실행' if stage == 'criteria' else '보고 생성 및 사용자 전달'
        except HarnessError as error:
            record['error'] = str(error)
            state['next'] = f'{stage} 검토 실패/미검증: {error}'
            raise
        finally:
            save_json(folder / 'receipt.json', record)
            record['evidence_hashes'] = {name: file_hash(folder / name) for name in ['answer.json', 'receipt.json', 'events.jsonl', 'input.txt', 'manifest.json']}
            self.save(plan, state)
        return record

    @staticmethod
    def review_evidence_current(record, developer_session):
        folder = Path(record.get('folder', '/nonexistent-proofstill-review'))
        return bool(record.get('session') and record['session'] != developer_session
                    and all((folder / name).is_file() and record.get('evidence_hashes', {}).get(name) == file_hash(folder / name)
                            for name in ['answer.json', 'receipt.json', 'events.jsonl', 'input.txt', 'manifest.json']))

    def review_current(self, plan, state, criteria, source):
        record = state.get('reviews', {}).get('implementation', {})
        return bool(criteria and record.get('criteria_digest') == criteria and record.get('source_digest') == source
                    and self.review_evidence_current(record, state['developer_session'])
                    and all(self.evidence_current(self.latest(state, 'green', c['id']))
                            and self.latest(state, 'green', c['id'])['accepted'] for c in plan['checks']))

    def status(self, feature):
        plan, state = self.load(feature)
        reasons = []
        try:
            criteria, source = self.green_ready(plan, state)
            review = state['reviews'].get('implementation', {})
            require(review.get('passed') and self.review_current(plan, state, criteria, source), '현재 버전의 독립 구현 리뷰가 필요합니다')
        except HarnessError as error:
            reasons.append(str(error))
        if 'criteria' in plan.get('required_reviews', []):
            from .assurance import review_summary
            try:
                criteria_review = review_summary(self, plan, state, 'criteria', self.criteria_digest(plan, state), self.source_digest(plan))
                require(criteria_review['status'] == 'passed', '현재 버전의 독립 기준 리뷰가 필요합니다')
                for requirement in plan['requirements']:
                    require(bool(requirement.get('criteria_checks')), f"기준을 시험한 검사 연결이 필요합니다: {requirement['id']}")
            except HarnessError as error:
                reasons.append(str(error))
        for artifact in plan['artifacts']:
            if artifact.get('path') and not (self.root / artifact['path']).is_file():
                reasons.append(f"아티팩트 파일 없음: {artifact['path']}")
        from .collaboration import readiness
        from .handoff import snapshot
        handoff_reasons = reasons + readiness(self, plan, state, snapshot(self, feature))
        return {'complete': not reasons, 'reasons': reasons, 'handoff_ready': not handoff_reasons,
                'handoff_reasons': handoff_reasons, 'user_acceptance': 'unconfirmed'}

    @exclusive
    def implement(self, feature, requirement, status, paths, remaining='', note=''):
        from .handoff import record_implementation
        return record_implementation(self, feature, requirement, status, paths, remaining, note)

    @exclusive
    def checkpoint(self, feature, next_action, assumptions=None):
        plan, state = self.load(feature)
        require(isinstance(next_action, str) and next_action.strip(), '다음 행동이 필요합니다')
        if assumptions is None:
            assumptions = state.get('checkpoint', {}).get('assumptions', [])
        require(isinstance(assumptions, list) and all(isinstance(a, str) and a.strip() for a in assumptions), '가정은 비어 있지 않은 문자열 배열이어야 합니다')
        state['checkpoint'] = {'next': next_action, 'assumptions': assumptions,
                               'source_digest': self.source_digest(plan), 'criteria_digest': self.criteria_digest(plan, state)}
        self.save(plan, state)
        return state['checkpoint']

    @exclusive
    def decision(self, feature, decision_id, question, answer='', source=''):
        plan, state = self.load(feature)
        require(isinstance(decision_id, str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9-]{0,63}', decision_id), '잘못된 결정 ID')
        require(isinstance(question, str) and question.strip(), '사람이 결정할 질문이 필요합니다')
        require(isinstance(answer, str) and isinstance(source, str), '답변/출처는 문자열이어야 합니다')
        require(bool(answer.strip()) == bool(source.strip()), '결정 해소에는 실제 답변과 출처가 함께 필요합니다')
        state.setdefault('decisions', {})[decision_id] = {'question': question, 'answer': answer.strip(), 'source': source.strip()}
        self.save(plan, state)
        return state['decisions'][decision_id]

    @exclusive
    def report(self, feature):
        return self._report(feature)

    def _report(self, feature):
        from .report import render
        plan, state = self.load(feature)
        status = self.status(feature)
        folder = self.root / 'reports'
        folder.mkdir(exist_ok=True)
        report = folder / f'{feature}.md'
        report.write_text(render(self, plan, state, status))
        state['report'] = str(report)
        self.save(plan, state)
        return report

    @exclusive
    def cleanup(self, feature):
        plan, state = self.load(feature)
        status = self.status(feature)
        require(status['complete'], '미완료 작업의 임시 상태는 보존합니다')
        require(status['handoff_ready'], '인계 준비 미완료: ' + '; '.join(status['handoff_reasons']) + '. 재개 맥락을 보존합니다')
        report = Path(state.get('report', '/nonexistent-proofstill-report'))
        require(report.is_file(), '보고를 생성하고 사용자에게 전달한 뒤 정리하세요')
        self._report(feature)
        work = self.work(feature)
        require(not work.is_symlink() and work.resolve().is_relative_to(self.root / '.proofstill/work'), '잘못된 작업 폴더')
        # Only remove the owned brief; never recursively remove arbitrary user artifacts.
        if work.exists():
            unknown = [p for p in work.iterdir() if p.name != 'brief.md' or not p.is_file() or p.is_symlink()]
            require(not unknown, '작업 폴더에 하네스 소유가 아닌 파일이 있습니다. 먼저 보존 위치를 확인하세요')
            (work / 'brief.md').unlink(missing_ok=True)
            work.rmdir()
        state.update(closed=True, next='검증 완료·보고 보존·임시 상태 정리')
        self.save(plan, state)
