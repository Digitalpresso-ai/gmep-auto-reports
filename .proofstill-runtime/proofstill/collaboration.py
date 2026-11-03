"""Delegation boundaries and the durable context needed before handing work on."""
from .contract import HarnessError, require


def validate_collaboration(plan):
    if 'collaboration' not in plan:
        return
    contract = plan['collaboration']
    require(isinstance(contract, dict), 'collaboration은 객체여야 합니다')
    for field in ['human', 'ai']:
        require(isinstance(contract.get(field), str) and contract[field].strip(), f'collaboration.{field} 담당 범위가 필요합니다')
    checks = contract.get('human_checks')
    require(isinstance(checks, list) and checks, '사람의 확인 행동 human_checks가 필요합니다')
    ids = {r['id'] for r in plan['requirements']}
    covered = set()
    for check in checks:
        require(isinstance(check, dict) and check.get('requirement') in ids, '사람 확인 행동의 요구 ID가 잘못됐습니다')
        for field in ['action', 'expected']:
            require(isinstance(check.get(field), str) and check[field].strip(), f'사람 확인 행동의 {field}가 필요합니다')
        covered.add(check['requirement'])
    require(covered == ids, '모든 요구에 사람의 확인 행동과 기대 결과를 연결하세요')


def pending_decisions(state):
    return {key: value for key, value in state.get('decisions', {}).items() if not value.get('answer')}


def require_decisions_resolved(state):
    pending = pending_decisions(state)
    require(not pending, '사람 결정 대기: ' + ', '.join(pending) + '. 답변과 출처를 decision으로 기록한 뒤 진행하세요')


def readiness(h, plan, state, rows):
    issues = [f"{row['requirementId']}: {issue}" for row in rows for issue in row['issues']]
    if not plan.get('collaboration'):
        issues.append('사람/AI 담당 범위와 요구별 사람 확인 행동이 미기록입니다.')
    checkpoint = state.get('checkpoint')
    if not checkpoint:
        issues.append('재개 맥락이 미기록입니다. checkpoint에 다음 행동과 가정을 기록하세요.')
    else:
        try:
            current = checkpoint['criteria_digest'] == h.criteria_digest(plan, state) and checkpoint['source_digest'] == h.source_digest(plan)
        except HarnessError:
            current = False
        if not current:
            issues.append('재개 맥락 이후 코드/기준이 변경됐습니다. 실제 파일을 대조하고 checkpoint를 갱신하세요.')
    for key, decision in pending_decisions(state).items():
        issues.append(f"사람 결정 대기 {key}: {decision['question']}")
    return issues


def context_lines(plan, state):
    contract = plan.get('collaboration', {})
    checkpoint = state.get('checkpoint', {})
    lines = ['', '## 담당과 재개 맥락', '',
             '- 사람: ' + contract.get('human', '미기록 — 의도·범위·수용 판단 담당'),
             '- AI: ' + contract.get('ai', '미기록 — 명시적으로 위임된 조사·구현·검증만 수행'),
             '- 현재 실행 상태: ' + state.get('next', '미기록'),
             '- 다음 행동: ' + checkpoint.get('next', '미기록'),
             '- 가정: ' + (' / '.join(checkpoint.get('assumptions', [])) or '미기록/없음 — checkpoint 원문 확인')]
    decisions = state.get('decisions', {})
    if not decisions:
        lines.append('- 결정 기록: 없음. 사용자 수용을 의미하지 않습니다.')
    for key, decision in decisions.items():
        lines.append(f"- 결정 {key}: {decision['question']} → " + (f"{decision['answer']} (출처: {decision['source']})" if decision.get('answer') else '사람 답변 대기'))
    lines += ['', '## 사람이 직접 확인할 행동', '']
    for check in contract.get('human_checks', []):
        lines.append(f"- {check['requirement']}: {check['action']} → 기대: {check['expected']}")
    if not contract.get('human_checks'):
        lines.append('- 미기록. 구체적인 입력·조작과 기대 결과를 요구별로 정의해야 합니다.')
    return lines
