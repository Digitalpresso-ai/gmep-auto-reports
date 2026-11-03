import copy
import inspect
import json
import math
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from .contract import HarnessError


class TraceError(HarnessError):
    pass


def snapshot(value):
    def check(item):
        if isinstance(item, dict):
            if not all(isinstance(k, str) for k in item):
                raise TraceError('JSON 객체의 키는 문자열이어야 합니다')
            for v in item.values():
                check(v)
        elif isinstance(item, list):
            for v in item:
                check(v)
        elif item is not None and type(item) not in [str, bool, int, float]:
            raise TraceError(f'JSON 데이터만 기록할 수 있습니다: {type(item).__name__}')
        elif type(item) is float and not math.isfinite(item):
            raise TraceError('유한한 수만 기록할 수 있습니다')
    check(value)
    return copy.deepcopy(value)


def pointer(value, path):
    if not isinstance(path, str) or (path and not path.startswith('/')):
        raise TraceError('JSON pointer는 빈 문자열 또는 /로 시작해야 합니다')
    try:
        for raw in path.split('/')[1:]:
            key = raw.replace('~1', '/').replace('~0', '~')
            if isinstance(value, list):
                if not key.isdecimal() or (key != '0' and key.startswith('0')):
                    raise KeyError(key)
                value = value[int(key)]
            elif isinstance(value, dict):
                value = value[key]
            else:
                raise KeyError(key)
        return snapshot(value)
    except (KeyError, IndexError, ValueError) as error:
        raise TraceError(f'참조 경로 없음: {path}') from error


def same(left, right):
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(right, sort_keys=True, allow_nan=False)


@dataclass(frozen=True)
class Reference:
    trace_id: str
    source: str
    path: str = ''
    step_id: str = ''


@dataclass(frozen=True)
class Step:
    trace_id: str
    id: str
    _value: object

    @property
    def value(self):
        return snapshot(self._value)

    def ref(self, path=''):
        return Reference(self.trace_id, 'step', path, self.id)


class Flow:
    def __init__(self, name, context=None, path=None):
        if not isinstance(name, str) or not name.strip():
            raise TraceError('흐름 이름이 필요합니다')
        self.name, self.id = name, uuid.uuid4().hex
        self._context = snapshot({} if context is None else context)
        if not isinstance(self._context, dict):
            raise TraceError('컨텍스트는 JSON 객체여야 합니다')
        self.version, self.sequence, self._step_index = 0, 0, 0
        self._outputs, self._closed, self._failed, self._active = {}, False, False, False
        directory = Path(os.environ.get('PROOFSTILL_TRACE_DIR', '.proofstill/evidence/traces'))
        self.path = Path(path) if path is not None else directory / f'{self.id}.jsonl'
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self._stream = self.path.open('x', encoding='utf-8')
        except FileExistsError as error:
            raise TraceError(f'기존 trace는 덮어쓰지 않습니다: {self.path}') from error
        self._emit('flow.started', name=name, context=self._context, context_version=0)

    def _emit(self, event, **data):
        if self._closed:
            raise TraceError('종료된 흐름입니다')
        record = {'schema_version': 1, 'trace_id': self.id, 'sequence': self.sequence,
                  'at': datetime.now(timezone.utc).isoformat(), 'event': event, **snapshot(data)}
        self._stream.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + '\n')
        self._stream.flush()
        self.sequence += 1

    def __enter__(self):
        return self

    def __exit__(self, kind, error, traceback):
        self.close(error)

    def close(self, error=None):
        if not self._closed:
            self._emit('flow.finished', status='failed' if self._failed or error is not None else 'completed',
                       error=None if error is None else {'type': type(error).__name__, 'message': str(error)})
            self._stream.close()
            self._closed = True

    def context_ref(self, path=''):
        return Reference(self.id, 'context', path)

    def set_context(self, context):
        if self._active:
            raise TraceError('단계 실행 중에는 컨텍스트를 바꿀 수 없습니다')
        value = snapshot(context)
        if not isinstance(value, dict):
            raise TraceError('컨텍스트는 JSON 객체여야 합니다')
        self._emit('context.updated', context=value, context_version=self.version + 1)
        self._context, self.version = value, self.version + 1

    def _resolve(self, value, bindings, target=''):
        if isinstance(value, Reference):
            if value.trace_id != self.id:
                raise TraceError('다른 흐름의 참조는 사용할 수 없습니다')
            binding = {'input': target, 'source': value.source, 'path': value.path}
            if value.source == 'context':
                result = pointer(self._context, value.path)
                binding['context_version'] = self.version
            elif value.source == 'step' and value.step_id in self._outputs:
                result = pointer(self._outputs[value.step_id], value.path)
                binding['step_id'] = value.step_id
            else:
                raise TraceError('완료되지 않았거나 존재하지 않는 단계 참조입니다')
            bindings.append(binding)
            return result
        if isinstance(value, dict):
            return {k: self._resolve(v, bindings, target + '/' + k.replace('~', '~0').replace('/', '~1')) for k, v in value.items()}
        if isinstance(value, list):
            return [self._resolve(v, bindings, target + '/' + str(i)) for i, v in enumerate(value)]
        return snapshot(value)

    def transition(self, operation, description, function, *, state, inputs=None, ui=None, transition_id=None):
        if not callable(state):
            raise TraceError('실제 앱 상태를 읽는 함수가 필요합니다')
        return self.step(operation, description, function, inputs=inputs, ui=ui, state=state, transition_id=transition_id)

    def step(self, operation, description, function, inputs=None, ui=None, *, state=None, transition_id=None):
        if self._closed or self._active:
            raise TraceError('종료되었거나 다른 단계 실행 중인 흐름입니다')
        if not isinstance(operation, str) or not operation.strip() or not isinstance(description, str) or not description.strip():
            raise TraceError('단계의 작업 이름과 설명이 필요합니다')
        if inputs is not None and (not isinstance(inputs, dict) or not all(isinstance(k, str) for k in inputs)):
            raise TraceError('입력은 이름 있는 JSON 인자 객체여야 합니다')
        if ui is not None and (not isinstance(ui, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in ui.items())):
            raise TraceError('UI 매핑은 문자열 객체여야 합니다')
        if transition_id is not None and (not isinstance(transition_id, str) or not transition_id.strip() or not callable(state)):
            raise TraceError('전이 ID에는 실제 상태 관측 함수와 비어 있지 않은 문자열이 필요합니다')
        identifier = uuid.uuid4().hex
        target = getattr(function, '__func__', function)
        code = getattr(target, '__code__', None)
        location = None if code is None else {'file': str(Path(code.co_filename).resolve()), 'line': code.co_firstlineno}
        self._emit('step.started', step_id=identifier, index=self._step_index, operation=operation,
                   description=description, context=self._context, context_version=self.version,
                   ui={} if ui is None else ui, callable=getattr(target, '__qualname__', type(target).__name__), code=location,
                   stateful=state is not None, transition_id=transition_id)
        self._step_index += 1
        started = time.monotonic()
        self._active = True
        try:
            bindings = []
            resolved = self._resolve({} if inputs is None else inputs, bindings)
            self._emit('step.inputs', step_id=identifier, inputs=resolved, bindings=bindings)
            if state is not None:
                from .state import state_snapshot, state_delta
                before = state_snapshot(state())
                self._emit('step.state.before', step_id=identifier, state=before)
                def observe_after():
                    after = state_snapshot(state())
                    self._emit('step.state.after', step_id=identifier, state=after, delta=state_delta(before, after))
                try:
                    output = snapshot(function(**snapshot(resolved)))
                except BaseException:
                    try:
                        observe_after()
                    except BaseException:
                        # 관측 실패로 앱의 원래 예외를 덮지 않는다. 누락된 after는 검증에서 거부된다.
                        pass
                    raise
                else:
                    observe_after()
            else:
                output = snapshot(function(**snapshot(resolved)))
            self._emit('step.finished', step_id=identifier, status='completed', output=output, error=None,
                       duration_ms=round((time.monotonic() - started) * 1000, 3))
            self._outputs[identifier] = snapshot(output)
            return Step(self.id, identifier, snapshot(output))
        except BaseException as error:
            self._failed = True
            self._emit('step.finished', step_id=identifier, status='failed', output=None,
                       error={'type': type(error).__name__, 'message': str(error)},
                       duration_ms=round((time.monotonic() - started) * 1000, 3))
            raise
        finally:
            self._active = False
