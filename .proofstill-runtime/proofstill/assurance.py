"""Explain acceptance criteria using current executions and independent verdicts."""
from pathlib import Path
from .contract import HarnessError, file_hash, read_json, require
from .trace_check import verify_trace


def validate_assurance(root, plan):
    required = plan.get('required_reviews', [])
    require(isinstance(required, list) and all(stage in ['criteria'] for stage in required), 'required_reviews에는 criteria만 추가할 수 있습니다')
    check_ids = {c['id'] for c in plan['checks']}
    for requirement in plan['requirements']:
        for field in ['risk', 'rationale']:
            if field in requirement:
                require(isinstance(requirement[field], str) and requirement[field].strip(), f'요구별 {field}는 비어 있지 않은 설명이어야 합니다')
        ids = requirement.get('criteria_checks', [])
        require(isinstance(ids, list) and all(check in check_ids and check in requirement['checks'] for check in ids), '기준 검사는 해당 요구에 연결된 check ID여야 합니다')
    for check in plan['checks']:
        cases = check.get('cases', [])
        require(isinstance(cases, list), 'cases는 배열이어야 합니다')
        if not cases:
            continue
        require(bool(check.get('trace_expectation')), '대표 사례에는 실제 흐름 검증 기준이 필요합니다')
        expectation = read_json(root / check['trace_expectation'])
        operations = expectation.get('operations', [])
        seen = set()
        for case in cases:
            require(isinstance(case, dict), '대표 사례는 객체여야 합니다')
            for field in ['operation', 'situation', 'expected']:
                require(isinstance(case.get(field), str) and case[field].strip(), f'대표 사례의 {field}가 필요합니다')
            operation = case['operation']
            require(operation in operations and operation not in seen, '대표 사례의 실제 operation 연결이 누락/중복됐습니다')
            seen.add(operation)
            index = operations.index(operation)
            require(any(a.get('step') == index and a.get('field') == 'output' for a in expectation.get('assertions', [])), '대표 사례의 실제 출력에 대한 기대값 검사가 필요합니다')


def review_summary(h, plan, state, stage, criteria, source):
    record = state.get('reviews', {}).get(stage)
    if not record:
        return {'status': 'not_run', 'evidence': '독립 기준 검토를 아직 실행하지 않았어요.' if stage == 'criteria' else '독립 구현 검토를 아직 실행하지 않았어요.', 'findings': [], 'limitations': [], 'history': []}
    current = bool(criteria and record.get('criteria_digest') == criteria and record.get('source_digest') == source
                   and h.review_evidence_current(record, state['developer_session']))
    answer = record.get('answer', {})
    status = 'stale' if not current else 'passed' if record.get('passed') else 'failed' if answer.get('verdict') == 'fail' else 'unverified'
    history = []
    for previous in state.get('review_history', []):
        if previous.get('stage') != stage or previous.get('folder') == record.get('folder'):
            continue
        old = previous.get('answer', {})
        history.append({'verdict': old.get('verdict', 'unverified'), 'findings': old.get('findings', []),
                        'checks': old.get('checks', []), 'session': previous.get('session'),
                        'label': '이전 판정 · 현재 통과 근거로 사용하지 않아요.'})
    checks = answer.get('checks', [])
    expected = {r['id'] for r in plan['requirements']}
    valid_checks = (isinstance(checks, list) and len(checks) == len(expected)
                    and all(isinstance(c, dict) and isinstance(c.get('id'), str) and c['id'] in expected
                            and c.get('status') in ['pass', 'fail', 'unverified']
                            and isinstance(c.get('evidence'), str) and c['evidence'].strip() for c in checks)
                    and {c['id'] for c in checks} == expected)
    return {'status': status, 'checksValid': valid_checks, 'evidence': record.get('error', ''), 'findings': answer.get('findings', []),
            'limitations': answer.get('limitations', []), 'history': history, 'session': record.get('session'),
            'checks': answer.get('checks', [])}


def requirement_review(summary, requirement_id):
    result = dict(summary)
    item = next((c for c in summary.get('checks', []) if isinstance(c, dict) and c.get('id') == requirement_id), None)
    result['gateStatus'] = summary['status']
    if item and summary.get('checksValid') and summary['status'] not in ['stale', 'not_run']:
        result['status'] = {'pass': 'passed', 'fail': 'failed', 'unverified': 'unverified'}[item['status']]
        result['evidence'] = item.get('evidence', '')
    result.pop('checks', None)
    result.pop('checksValid', None)
    return result


def observations(h, feature, check, run, current):
    steps = []
    if run and current:
        for trace in run.get('traces', []):
            path = Path(trace['path']).resolve()
            if not path.is_relative_to(h.folder(feature).resolve()) or file_hash(path) != trace.get('sha256'):
                continue
            try:
                expected = read_json(h.root / check['trace_expectation']) if check.get('trace_expectation') else None
                verified = verify_trace(path, expected)
                if verified['valid']:
                    steps.extend(verified['steps'])
            except (HarnessError, OSError, ValueError):
                continue
    cases = []
    for case in check.get('cases', []):
        matches = [step for step in steps if step['operation'] == case['operation'] and step['status'] == 'completed']
        output = matches[0]['output'] if len(matches) == 1 else None
        summary = output.get('summary') if isinstance(output, dict) else output if isinstance(output, str) else None
        confirmed = bool(isinstance(summary, str) and summary.strip() and run and run.get('accepted'))
        cases.append({**case, 'observed': summary if confirmed else '현재 버전에서 확인한 실행 관찰이 없어요.',
                      'status': 'passed' if confirmed else 'stale' if run and not current else 'unverified',
                      'recordedAt': run.get('recorded_at') if run else None})
    return cases
