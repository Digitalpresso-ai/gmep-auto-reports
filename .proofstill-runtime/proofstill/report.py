import shlex
from pathlib import Path
from urllib.parse import quote
from .contract import HarnessError


def link(label, path):
    return f'[{label}]({quote(str(path), safe="/:?#=&%")})'


def render(h, plan, state, status):
    evidence = h.folder(plan['id'])
    current_source = h.source_digest(plan)
    try:
        current_criteria = h.criteria_digest(plan, state)
    except HarnessError:
        current_criteria = None
    criteria_valid = current_criteria is not None
    def current_run(run, phase='green'):
        return bool(criteria_valid and h.evidence_current(run) and run['criteria_digest'] == current_criteria
                    and (phase == 'red' or run['source_digest'] == current_source))
    lines = [f"# {plan['title']} — 기능 개발 보고", '',
             f"- 자동 검사·독립 리뷰: **{'검증 완료' if status['complete'] else '미완료'}**",
             f"- 인계 준비: {'필수 정보·기술 근거 있음' if status['handoff_ready'] else '보완 필요'}", '- 사용자 수용: 미확인',
             f"- 의도: {plan['intent']}", f"- 업무 맥락: {plan['context']}",
             f"- 명령 실행 위치: `{h.root}`",
             f"- 기준: {link('고정된 요구사항·명령', evidence / 'plan.json')}",
             f"- 기준 버전: `{current_criteria}`", f"- 소스 버전: `{current_source}`", '',
             '## 요구사항과 검증', '', '| 요구사항 | 상태 | 테스트·근거 |', '|---|---|---|']
    for item in plan['requirements']:
        refs = []
        passed = True
        for check_id in item['checks']:
            run = h.latest(state, 'green', check_id)
            current = bool(current_run(run) and run['accepted'])
            passed = passed and current
            refs.append(link(check_id, run['log']) if run else f'{check_id}: 미실행')
        label = '자동 검사 통과' if passed else '실패/미검증'
        lines.append(f"| {item['id']}: {item['text'].replace('|', '/')} | {label} | {', '.join(refs)} |")
    lines += ['', '## 재현 명령과 검사 결과', '']
    for check in plan['checks']:
        lines += [f"### {check['id']} · {check['kind']} · {check['module']}", '',
                  '```sh', shlex.join(check['argv']), '```', '']
        for phase in ['red', 'green']:
            run = h.latest(state, phase, check['id'])
            if run:
                valid = current_run(run, phase)
                label = '현재 버전에서 무효' if not valid else ('기대 결과 확인' if run['accepted'] else '실패/미검증')
                lines.append(f"- {phase.title()}: {label} · 종료 코드 `{run['exit_code']}` · {link('출력', run['log'])} · {link('실행 영수증', run['receipt'])}")
            else:
                lines.append(f"- {phase.title()}: {'선택 검사 · 미실행' if phase == 'red' else '미실행'}")
        if check.get('trace_expectation'):
            lines.append('- ' + link('고정된 기대 흐름', h.root / check['trace_expectation']))
        run = h.latest(state, 'green', check['id'])
        for trace in (run or {}).get('traces', []):
            viewer = link('UI 추적 보기', trace['html']) if trace.get('html') else 'UI 뷰어 미생성'
            lines.append(f"- 흐름 {trace['name']} · {trace['steps']}단계 · {viewer} · {link('원본 JSONL', trace['path'])}")
            if 'state_machine' in trace:
                coverage = trace['state_machine']
                lines.append('- 상태머신 실행 전이: ' + ', '.join(coverage['visited_transitions']))
                lines.append('- 상태머신 미실행 전이: ' + (', '.join(coverage['unvisited_transitions']) or '없음'))
            for issue in trace['issues']:
                lines.append(f'  - 흐름 검증: {issue}')
        for path in check['files']:
            item = h.root / path
            if item.is_file():
                lines.append(f"- {link('테스트 코드', item)}")
            elif item.is_dir():
                for test in sorted(item.rglob('*')):
                    if test.is_file() and '__pycache__' not in test.parts:
                        lines.append(f"- {link('테스트 ' + test.name, test)}")
    lines += ['', '## 독립 리뷰', '']
    for stage, title in [('criteria', '사전 기준 검토 · 선택'), ('implementation', '기준·구현 최종 검토')]:
        if stage == 'criteria' and stage in plan.get('required_reviews', []):
            title = '기준 적절성 독립 검토 · 필수'
        record = state['reviews'].get(stage)
        if not record:
            lines.append(f'- {title}: 미실행')
            continue
        folder = Path(record['folder'])
        valid = h.review_evidence_current(record, state['developer_session']) and criteria_valid and record['criteria_digest'] == current_criteria and ((stage == 'criteria' and stage not in plan.get('required_reviews', [])) or record['source_digest'] == current_source)
        if stage == 'implementation':
            valid = valid and h.review_current(plan, state, current_criteria, current_source) and all(current_run(h.latest(state, 'green', c['id']))
                                  and h.latest(state, 'green', c['id'])['accepted'] for c in plan['checks'])
        label = '현재 버전에서 무효' if not valid else ('통과' if record['passed'] else '실패/미검증')
        lines += [f"- {title}: {label} · 세션 `{record.get('session', '미확인')}` · 실행기 `{record['launcher']}`"]
        for name in ['answer.json', 'receipt.json', 'events.jsonl', 'input.txt', 'manifest.json']:
            path = folder / name
            if path.is_file():
                lines.append('  - ' + link(name, path))
        for check in record.get('answer', {}).get('checks', []):
            lines.append(f"  - {check.get('id')}: {check.get('status')} — {check.get('evidence')}")
    lines += ['', '## 구현·아티팩트', '']
    for artifact in plan['artifacts']:
        if artifact.get('url'):
            lines.append('- ' + link(artifact['label'], artifact['url']))
        else:
            path = (h.root / artifact['path']).resolve()
            lines.append('- ' + (link(artifact['label'], path) if path.is_file() else f"누락: {artifact['label']} — {path}"))
    lines += ['', '## 한계·남은 사항', '']
    limitations = list(plan['limitations']) + status['reasons']
    for record in state['reviews'].values():
        limitations += record.get('answer', {}).get('limitations', [])
    for limitation in dict.fromkeys(limitations):
        lines.append('- ' + limitation)
    lines.append('- 검증은 위 기준과 대상 버전에 한정하며, 모든 버그의 부재나 사용자의 최종 수용을 뜻하지 않는다.')
    from .handoff import briefing
    overview = briefing(h, plan['id'])
    lines[2:2] = [overview, '']
    return '\n'.join(lines) + '\n'
