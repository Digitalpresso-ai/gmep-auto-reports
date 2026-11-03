import json
from pathlib import Path
from .trace import TraceError, pointer, same
from .state import state_snapshot, state_delta, verify_states


def verify_trace(path, expected=None):
    result = {'valid': False, 'issues': [], 'steps': [], 'status': 'incomplete', 'trace_id': None, 'name': ''}
    def require(ok, message):
        if not ok:
            raise TraceError(message)
    try:
        require(expected is None or isinstance(expected, dict), '기대 흐름은 JSON 객체여야 합니다')
        expected = {} if expected is None else expected
        def reject_constant(value):
            raise TraceError('JSON에 비유한 수가 있습니다: ' + value)
        records = [json.loads(line, parse_constant=reject_constant) for line in Path(path).read_text().splitlines() if line.strip()]
        require(all(isinstance(r, dict) for r in records), '이벤트는 JSON 객체여야 합니다')
        require(records and records[0].get('event') == 'flow.started', '흐름 시작 기록이 없습니다')
        first = records[0]
        result.update(trace_id=first['trace_id'], name=first['name'])
        contexts = {0: first['context']}
        version, active, finished = 0, None, False
        by_id, completed, last_state = {}, set(), None
        for sequence, event in enumerate(records):
            require(not finished, '흐름 종료 뒤 이벤트가 있습니다')
            require(event.get('schema_version') == 1 and event.get('trace_id') == first['trace_id'], 'trace ID/스키마 혼입')
            require(type(event.get('sequence')) is int and event['sequence'] == sequence, '이벤트 순서가 잘못됐습니다')
            kind = event.get('event')
            if sequence == 0:
                require(version == event.get('context_version'), '초기 컨텍스트 버전 오류')
                continue
            if kind == 'context.updated':
                require(active is None and event.get('context_version') == version + 1, '컨텍스트 갱신 순서 오류')
                version += 1
                contexts[version] = event['context']
            elif kind == 'step.started':
                identifier = event['step_id']
                require(active is None and identifier not in by_id, '중복/동시 단계 시작')
                require(event.get('index') == len(result['steps']), '단계 순서 오류')
                require(isinstance(event.get('operation'), str) and event['operation'].strip()
                        and isinstance(event.get('description'), str) and event['description'].strip(), '작업 이름/설명 누락')
                require(event.get('context_version') == version and same(event['context'], contexts[version]), '컨텍스트 스냅샷 불일치')
                step = {'id': identifier, 'index': event['index'], 'operation': event['operation'],
                        'description': event['description'], 'context': event['context'], 'context_version': version,
                        'ui': event.get('ui', {}), 'code': event.get('code'), 'callable': event.get('callable'),
                        'started_at': event['at'], 'status': 'incomplete', 'inputs': None, 'bindings': [], 'output': None, 'error': None,
                        'stateful': event.get('stateful', False), 'state': None,
                        'transition_id': event.get('transition_id')}
                require(type(step['stateful']) is bool, '상태 관측 표식 형식 오류')
                require(step['transition_id'] is None or (step['stateful'] and isinstance(step['transition_id'], str)
                        and step['transition_id'].strip()), '전이 ID/실제 상태 관측 표식 오류')
                by_id[identifier] = step
                result['steps'].append(step)
                active = identifier
            elif kind == 'step.inputs':
                require(active is not None and event.get('step_id') == active, '입력 이벤트의 단계 불일치')
                step = by_id[active]
                require(step['inputs'] is None and isinstance(event['inputs'], dict) and isinstance(event['bindings'], list), '입력 누락/중복/형식 오류')
                seen = set()
                for binding in event['bindings']:
                    require(binding['input'] not in seen, '같은 입력에 중복된 출처')
                    seen.add(binding['input'])
                    if binding['source'] == 'step':
                        require(binding['step_id'] in completed, '미래/실패/없는 단계의 출력 참조')
                        source = by_id[binding['step_id']]['output']
                    elif binding['source'] == 'context':
                        require(binding.get('context_version') == step['context_version'], '다른 컨텍스트 버전 참조')
                        source = contexts[binding['context_version']]
                    else:
                        raise TraceError('알 수 없는 출처 종류')
                    require(same(pointer(event['inputs'], binding['input']), pointer(source, binding['path'])), '출처 값과 전달된 입력이 다릅니다')
                step.update(inputs=event['inputs'], bindings=event['bindings'])
            elif kind in ['step.state.before', 'step.state.after']:
                require(active is not None and event.get('step_id') == active, '상태 이벤트 단계 불일치')
                step = by_id[active]
                require(step['stateful'] and step['inputs'] is not None, '상태 관측 표식/입력 누락')
                observed = state_snapshot(event['state'])
                if kind == 'step.state.before':
                    require(step['state'] is None, '중복 상태 before')
                    require(last_state is None or same(last_state, observed), '미계측 상태 변경: 이전 after와 다음 before가 다릅니다')
                    step['state'] = {'before': observed}
                else:
                    require(step['state'] is not None and 'after' not in step['state'], '상태 before 누락/after 중복')
                    delta = state_delta(step['state']['before'], observed)
                    require(same(delta, event['delta']), '상태 delta가 실제 전후 값과 다릅니다')
                    step['state'].update(after=observed, delta=delta)
                    last_state = observed
            elif kind == 'step.finished':
                require(active is not None and event.get('step_id') == active, '시작 전/중복 단계 종료')
                step = by_id[active]
                require(not step['stateful'] or (step['state'] is not None and 'after' in step['state']), '실제 상태 관측이 미완료입니다')
                require(type(event.get('duration_ms')) in [int, float] and event['duration_ms'] >= 0, '잘못된 실행 시간')
                require(event['status'] in ['completed', 'failed'], '알 수 없는 단계 상태')
                if event['status'] == 'completed':
                    require(step['inputs'] is not None and event.get('error') is None, '성공 단계의 입력/오류 불일치')
                    completed.add(active)
                else:
                    require(isinstance(event.get('error'), dict) and event['error'].get('type'), '실패 원인 누락')
                step.update(status=event['status'], output=event['output'], error=event['error'],
                            duration_ms=event['duration_ms'], finished_at=event['at'])
                active = None
            elif kind == 'flow.finished':
                require(active is None, '미완료 단계가 남아 있습니다')
                require(event.get('status') in ['completed', 'failed'], '알 수 없는 흐름 상태')
                require(event['status'] != 'completed' or all(s['status'] == 'completed' for s in result['steps']), '실패 단계를 완료로 표시했습니다')
                result['status'] = event['status']
                finished = True
            else:
                raise TraceError('알 수 없는 이벤트')
        require(finished and active is None, '흐름이 끝나지 않았습니다')
        require(result['status'] == expected.get('status', 'completed'), '기대 흐름 종료 상태와 다릅니다')
        if 'name' in expected:
            require(result['name'] == expected['name'], '기대 흐름 이름과 다릅니다')
        if 'operations' in expected:
            require([s['operation'] for s in result['steps']] == expected['operations'], '기대 단계 순서/반복 횟수와 다릅니다')
        if 'state' in expected:
            coverage = verify_states(result['steps'], expected['state'])
            if coverage is not None:
                result['state_machine'] = coverage
        for assertion in expected.get('assertions', []):
            step = result['steps'][assertion['step']]
            require(same(pointer(step[assertion['field']], assertion.get('path', '')), assertion['equals']), '기대 단계 데이터와 다릅니다')
        for link in expected.get('links', []):
            target = result['steps'][link['to']]
            source = link['from']
            require(any(b['input'] == link['input'] and b['path'] == link['output'] and
                        ((source == 'context' and b['source'] == 'context') or
                         (type(source) is int and b['source'] == 'step' and b['step_id'] == result['steps'][source]['id']))
                        for b in target['bindings']), '필수 단계 데이터 연결이 없습니다')
        result['valid'] = True
    except (OSError, ValueError, KeyError, IndexError, TypeError, TraceError) as error:
        result['issues'].append(str(error))
    return result
