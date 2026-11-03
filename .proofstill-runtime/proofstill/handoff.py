"""Current requirement progress, separate from test and review verdicts."""
import shlex
from pathlib import Path
from .contract import HarnessError, digest, inventory, project_path, require

IMPLEMENTATION = {'unknown': '미기록', 'not_started': '미착수', 'in_progress': '진행 중', 'partial': '일부 구현', 'implemented': '구현 완료'}
VERIFICATION = {'not_run': '미실행', 'partial': '일부 확인', 'passed': '통과', 'failed': '실패', 'stale': '재검증 필요', 'unverified': '확인 불가', 'interrupted': '중단'}


def verification_status(checks):
    statuses = [c['status'] for c in checks]
    if 'failed' in statuses:
        return 'failed'
    if 'stale' in statuses:
        return 'stale'
    if statuses and all(s == 'passed' for s in statuses):
        return 'passed'
    if 'passed' in statuses:
        return 'partial'
    if 'interrupted' in statuses:
        return 'interrupted'
    if 'unverified' in statuses:
        return 'unverified'
    return 'not_run'


def snapshot(h, feature):
    from .assurance import observations, requirement_review, review_summary
    plan, state = h.load(feature)
    try:
        criteria = h.criteria_digest(plan, state)
    except HarnessError:
        criteria = None
    source = h.source_digest(plan) if criteria else None
    checks = {}
    for check in plan['checks']:
        run = h.latest(state, 'green', check['id'])
        current = bool(run and criteria and h.evidence_current(run) and run['criteria_digest'] == criteria and run['source_digest'] == source)
        label = 'not_run' if not run else 'unverified' if run.get('pending') else 'stale' if not current else 'interrupted' if run.get('timed_out') else 'passed' if run['accepted'] else 'unverified' if run.get('pending') or run['exit_code'] is None else 'failed'
        log = ''
        output_truncated = False
        if run:
            path = Path(run['log']).resolve()
            if path.is_relative_to(h.folder(feature).resolve()) and path.is_file():
                with path.open(errors='replace') as stream:
                    log = stream.read(100001)
                output_truncated = len(log) > 100000
                log = log[:100000]
                if output_truncated:
                    log += '\n[출력 생략: 원본이 100,000자를 초과하여 앞부분만 포함했습니다.]'
            else:
                log = '[실행 출력 근거를 찾을 수 없습니다. 원본 로그를 복구하거나 다시 검사하세요.]'
        checks[check['id']] = {'id': check['id'], 'label': check.get('label', check['id']), 'kind': check['kind'],
                                'surface': check.get('surface', 'code'), 'purpose': check.get('purpose', ''), 'rationale': check.get('rationale', ''), 'expected': check.get('expected', ''),
                                'command': shlex.join(check['argv']), 'status': label, 'output': log, 'outputTruncated': output_truncated,
                                'logPath': run.get('log') if run else None, 'receiptPath': run.get('receipt') if run else None,
                                'exitCode': run.get('exit_code') if run else None, 'recordedAt': run.get('recorded_at') if run else None,
                                'cases': observations(h, feature, check, run, current),
                                'files': check['files'], 'scope': check.get('scope', '등록된 검사 범위. 제품 화면 확인 여부는 검사 내용을 확인하세요.')}
    record = state.get('reviews', {}).get('implementation')
    review_current = h.review_current(plan, state, criteria, source)
    review_checks = {c['id']: c for c in (record or {}).get('answer', {}).get('checks', [])}
    criteria_review = review_summary(h, plan, state, 'criteria', criteria, source)
    implementation_review = review_summary(h, plan, state, 'implementation', criteria, source)
    rows = []
    for req in plan['requirements']:
        recorded = state.get('implementations', {}).get(req['id'], {})
        implementation = {key: recorded.get(key, default) for key, default in {'status': 'unknown', 'paths': [], 'remaining': '', 'note': ''}.items()}
        implementation_current = bool(recorded.get('source_digest') == source and criteria and recorded.get('criteria_digest') == criteria
                                      and all((h.root / p).exists() for p in implementation['paths'])
                                      and recorded.get('paths_digest') == digest(inventory(h.root, implementation['paths']))) if recorded.get('source_digest') else None
        issues = []
        if implementation['status'] != 'implemented':
            issues.append('구현 완료 기록이 없습니다. 코드와 남은 범위를 확인하세요.')
        if implementation_current is not True:
            issues.append('구현 기록의 현재 버전 근거가 없거나 변경됐습니다. 코드를 확인하고 다시 기록하세요.')
        linked = [checks[c] for c in req['checks']]
        review = review_checks.get(req['id'])
        review_status = 'not_run' if not record else 'stale' if not review_current else 'passed' if review and review['status'] == 'pass' and record.get('passed') else 'failed' if (review and review['status'] == 'fail') or (record or {}).get('answer', {}).get('verdict') == 'fail' else 'unverified'
        rows.append({'id': f'harness:{feature}:{req["id"]}', 'source': 'harness', 'taskId': feature, 'requirementId': req['id'],
                     'risk': req.get('risk', ''), 'rationale': req.get('rationale', ''),
                     'title': req.get('title', req['text']), 'description': req['text'], 'group': req.get('group', plan['title']), 'origin': plan['intent'] + '\n\n' + plan['context'], 'implementation': implementation,
                     'implementationCurrent': implementation_current, 'issues': issues,
                     'humanChecks': [c for c in plan.get('collaboration', {}).get('human_checks', []) if c['requirement'] == req['id']],
                     'responsibility': {'human': plan.get('collaboration', {}).get('human', ''), 'ai': plan.get('collaboration', {}).get('ai', '')},
                     'next': state.get('checkpoint', {}).get('next', ''),
                     'pendingDecisions': [{'id': key, **value} for key, value in state.get('decisions', {}).items() if not value.get('answer')],
                     'verification': {'status': verification_status(linked), 'checks': linked,
                                      'criteriaReview': requirement_review(criteria_review, req['id']),
                                      'criteriaChecks': [checks[c] for c in req.get('criteria_checks', [])],
                                      'criteriaRequired': 'criteria' in plan.get('required_reviews', []),
                                      'review': {**requirement_review(implementation_review, req['id']), 'status': review_status, 'evidence': (review or {}).get('evidence', (record or {}).get('error', ''))}},
                     'limitations': plan['limitations'] + (record or {}).get('answer', {}).get('limitations', []) + [str(f) for f in (record or {}).get('answer', {}).get('findings', [])]})
    return rows


def record_implementation(h, feature, requirement, status, paths, remaining='', note=''):
    plan, state = h.load(feature)
    require(requirement in [r['id'] for r in plan['requirements']], '알 수 없는 요구 ID')
    require(status in IMPLEMENTATION, '잘못된 구현 상태')
    require(all(isinstance(p, str) for p in paths), '구현 경로는 문자열 배열이어야 합니다')
    for path in paths:
        require(not Path(path).is_absolute(), '구현 경로는 프로젝트 상대 경로여야 합니다')
        require(project_path(h.root, path).exists(), f'구현 경로 없음: {path}')
    require(status != 'implemented' or paths, '구현 완료에는 구현 경로가 필요합니다')
    require(status != 'partial' or remaining.strip(), '일부 구현에는 남은 범위가 필요합니다')
    state.setdefault('implementations', {})[requirement] = {'status': status, 'paths': paths, 'remaining': remaining, 'note': note,
        'source_digest': h.source_digest(plan), 'criteria_digest': h.criteria_digest(plan, state),
        'paths_digest': digest(inventory(h.root, paths))}
    # This is an implementation declaration, never a test/review success claim.
    from .collaboration import require_decisions_resolved
    require_decisions_resolved(state)
    h.save(plan, state)
    return {key: state['implementations'][requirement][key] for key in ['status', 'paths', 'remaining', 'note']}


def markdown(rows):
    def cell(text):
        return str(text).replace('|', '/').replace('\n', ' ')
    lines = ['## 구현·검증 현황', '', '구현은 근거를 붙인 기록이며, 자동 검사와 독립 리뷰는 별도 판정입니다.', '',
             '| 요구 | 구현 | 자동 검사 | 독립 리뷰 | 남은 범위 |', '|---|---|---|---|---|']
    for row in rows:
        i, v = row['implementation'], row['verification']
        lines.append('| ' + ' | '.join(map(cell, [row['requirementId'] + ': ' + row['title'], IMPLEMENTATION[i['status']], VERIFICATION[v['status']], VERIFICATION[v['review']['status']], i.get('remaining') or '미기록'])) + ' |')
    return '\n'.join(lines)


def briefing(h, feature):
    from .collaboration import context_lines, readiness
    plan, state = h.load(feature)
    rows = snapshot(h, feature)
    lines = [f"# {plan['title']} — 인계 브리핑", '', f"목표: {plan['intent']}", f"맥락: {plan['context']}",
             f"실행 위치: `{h.root}`", f"기준·원문: {h.folder(feature) / 'plan.json'}",
             '맥락 자료: ' + (', '.join(plan['context_files']) or '기능 정의의 intent/context'),
             '', markdown(rows), '', '## 지금 확인할 일', '']
    for row in rows:
        lines.append(f"- {row['requirementId']}: {row['description']}")
        lines.append('- 구현 경로: ' + (', '.join(row['implementation']['paths']) or '미기록'))
        for issue in row['issues']:
            lines.append('- ' + issue)
    lines += ['', '## 재현 검사', '']
    checks = {check['id']: check for row in rows for check in row['verification']['checks']}
    for check in checks.values():
        lines.append(f"- {check['label']}: {VERIFICATION[check['status']]} · `{check['command']}`")
        lines.append('- 확인할 결과: ' + (check['expected'] or '검사 파일의 조건과 실제 출력 대조: ' + ', '.join(check['files'])))
        lines.append('- 확인 범위: ' + check['scope'])
        lines.append('- 실제 출력: ' + (check['logPath'] or '미실행 — 출력 없음'))
    lines += context_lines(plan, state)
    issues = readiness(h, plan, state, rows)
    lines += ['', '인계 정보: ' + ('보완 필요' if issues else '필수 정보 있음 — 기술 검사/리뷰 결과는 위 표에서 별도 확인')]
    lines += ['- ' + issue for issue in issues]
    lines += ['', '사용자 수용: 미확인. 사람이 원문·코드·실행 출력을 대조한 뒤 YES/NO로 판단합니다.',
              'NO이면 차이를 요구 ID에 연결해 수정하고 영향받는 검사·독립 리뷰를 다시 수행합니다.',
              '한계: 기록은 AI의 사실성을 보증하지 않습니다. 등록 밖 코드·검사, 하네스 우회, 거짓 기록은 별도 확인이 필요합니다.']
    for limitation in dict.fromkeys(x for row in rows for x in row['limitations']):
        lines.append('- ' + limitation)
    return '\n'.join(lines) + '\n'
