from .trace import TraceError, same, snapshot


def state_snapshot(value):
    value = snapshot(value)
    if (not isinstance(value, dict) or not {'feature', 'screen', 'data'} <= value.keys() <= {'feature', 'screen', 'data', 'state_id'}
            or any(not isinstance(value[k], str) or not value[k].strip() for k in ['feature', 'screen'])
            or not isinstance(value['data'], dict)
            or ('state_id' in value and (not isinstance(value['state_id'], str) or not value['state_id'].strip()))):
        raise TraceError('상태는 feature·screen 문자열과 data 객체, 선택 state_id 문자열을 가져야 합니다')
    return value


def state_delta(before, after):
    old, new = before['data'], after['data']
    return {'created': sorted(new.keys() - old.keys()),
            'retained': sorted(k for k in old.keys() & new.keys() if same(old[k], new[k])),
            'changed': sorted(k for k in old.keys() & new.keys() if not same(old[k], new[k])),
            'removed': sorted(old.keys() - new.keys())}


def verify_states(steps, contract):
    if isinstance(contract, dict) and 'states' in contract:
        return verify_machine(steps, contract)
    def require(ok, message):
        if not ok:
            raise TraceError(message)

    def names(value):
        return (isinstance(value, list) and all(isinstance(k, str) and k for k in value)
                and len(set(value)) == len(value))

    require(isinstance(contract, dict) and set(contract) == {'screens', 'transitions'}, '상태 계약은 screens·transitions가 필요합니다')
    screens, transitions = contract['screens'], contract['transitions']
    require(isinstance(screens, dict) and screens and isinstance(transitions, list), '상태 계약 형식 오류')
    for name, rule in screens.items():
        require(isinstance(name, str) and name and isinstance(rule, dict)
                and {'feature', 'required'} <= rule.keys() <= {'feature', 'required', 'optional'}, '화면 규칙 형식 오류')
        require(isinstance(rule['feature'], str) and rule['feature'].strip()
                and names(rule['required']) and names(rule.get('optional', [])), '화면 필드 규칙 형식 오류')
        require(not set(rule['required']) & set(rule.get('optional', [])), '필수/선택 필드가 중복됐습니다')
    covered = set()
    for rule in transitions:
        require(isinstance(rule, dict) and {'step', 'from', 'to'} <= rule.keys() <= {'step', 'from', 'to', 'preserve', 'drop'}, '상태 전이 규칙 형식 오류')
        index = rule['step']
        require(type(index) is int and 0 <= index < len(steps) and index not in covered, '상태 전이 단계 중복/범위 오류')
        require(rule['from'] in screens and rule['to'] in screens
                and names(rule.get('preserve', [])) and names(rule.get('drop', [])), '상태 전이 경로/필드 오류')
        covered.add(index)
        observed = steps[index].get('state')
        require(observed is not None, f'{index + 1}단계의 실제 상태 관측이 없습니다')
        before, after = observed['before'], observed['after']
        require(before['screen'] == rule['from'] and after['screen'] == rule['to'], f'{index + 1}단계 화면 전이 불일치')
        for key in rule.get('preserve', []):
            require(key in before['data'] and key in after['data'] and same(before['data'][key], after['data'][key]),
                    f'{index + 1}단계 유지 실패: {key}')
        for key in rule.get('drop', []):
            require(key in before['data'] and key not in after['data'], f'{index + 1}단계 제거 실패: {key}')
    observed_indices = {s['index'] for s in steps if s.get('state') is not None}
    require(covered == observed_indices and bool(covered), '상태 전이 기준 누락 또는 관측 누락')
    for step in steps:
        if step.get('state') is None:
            continue
        for when in ['before', 'after']:
            state = step['state'][when]
            require(state['screen'] in screens, 'IA에 없는 화면입니다: ' + state['screen'])
            rule = screens[state['screen']]
            keys = state['data'].keys()
            require(state['feature'] == rule['feature'], '화면의 기능 소유권 불일치')
            require(set(rule['required']) <= keys <= set(rule['required'] + rule.get('optional', [])),
                    f"{step['index'] + 1}단계 {when} {state['screen']}: 허용 상태 필드 불일치")


def verify_machine(steps, contract):
    def require(ok, message):
        if not ok:
            raise TraceError(message)

    def name(value):
        return isinstance(value, str) and bool(value.strip())

    def names(value):
        return isinstance(value, list) and all(name(k) for k in value) and len(set(value)) == len(value)

    require({'initial', 'states', 'transitions'} <= contract.keys() <=
            {'initial', 'states', 'transitions', 'required_transitions'}, '상태머신 계약 형식 오류')
    states, transitions = contract['states'], contract['transitions']
    require(isinstance(states, dict) and states and isinstance(transitions, dict) and transitions,
            '상태머신 states·transitions는 비어 있지 않은 객체여야 합니다')
    require(name(contract['initial']) and contract['initial'] in states, '상태머신 초기 상태 오류')
    for identifier, rule in states.items():
        require(name(identifier) and isinstance(rule, dict) and
                {'feature', 'screen', 'required'} <= rule.keys() <= {'feature', 'screen', 'required', 'optional'},
                '상태머신 상태 규칙 형식 오류')
        require(name(rule['feature']) and name(rule['screen']) and names(rule['required']) and names(rule.get('optional', [])),
                '상태머신 상태 필드 형식 오류')
        require(not set(rule['required']) & set(rule.get('optional', [])), '필수/선택 필드가 중복됐습니다')
    for identifier, rule in transitions.items():
        require(name(identifier) and isinstance(rule, dict) and
                {'from', 'to', 'operation'} <= rule.keys() <= {'from', 'to', 'operation', 'preserve', 'drop'},
                '상태머신 전이 규칙 형식 오류')
        require(name(rule['from']) and rule['from'] in states and name(rule['to']) and rule['to'] in states
                and name(rule['operation']) and names(rule.get('preserve', [])) and names(rule.get('drop', [])),
                '상태머신 전이 경로/동작/필드 오류')
        require(not set(rule.get('preserve', [])) & set(rule.get('drop', [])), '전이 유지/제거 필드가 중복됐습니다')
    required = contract.get('required_transitions', [])
    require(names(required) and all(k in transitions for k in required), '상태머신 필수 전이 오류')
    observed = [s for s in steps if s.get('state') is not None]
    require(bool(observed), '상태머신의 실제 상태 관측이 없습니다')
    require(observed[0]['state']['before'].get('state_id') == contract['initial'], '상태머신 초기 상태 불일치')
    visited = set()
    for step in observed:
        identifier = step.get('transition_id')
        require(name(identifier) and identifier in transitions, f"{step['index'] + 1}단계의 상태머신 전이 ID 누락/미등록")
        rule, actual = transitions[identifier], step['state']
        require(step['operation'] == rule['operation'], f'상태머신 전이 동작 불일치: {identifier}')
        before, after = actual['before'], actual['after']
        require(before.get('state_id') == rule['from'] and after.get('state_id') == rule['to'],
                f'허용되지 않은 상태머신 전이: {identifier}')
        for state in [before, after]:
            shape = states[state['state_id']]
            require(state['feature'] == shape['feature'] and state['screen'] == shape['screen'],
                    f"UX 상태의 기능/화면 불일치: {state['state_id']}")
            require(set(shape['required']) <= state['data'].keys() <= set(shape['required'] + shape.get('optional', [])),
                    f"UX 상태의 허용 필드 불일치: {state['state_id']}")
        for key in rule.get('preserve', []):
            require(key in before['data'] and key in after['data'] and same(before['data'][key], after['data'][key]),
                    f'상태머신 유지 실패: {identifier}.{key}')
        for key in rule.get('drop', []):
            require(key in before['data'] and key not in after['data'], f'상태머신 제거 실패: {identifier}.{key}')
        visited.add(identifier)
    require(set(required) <= visited, '상태머신 필수 전이 실행 누락: ' + ', '.join(sorted(set(required) - visited)))
    return {'visited_transitions': sorted(visited), 'unvisited_transitions': sorted(transitions.keys() - visited)}
