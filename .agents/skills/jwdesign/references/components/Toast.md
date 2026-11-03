# Toast

행동 결과를 3초 동안 알리는 짧은 메시지. 화면 아래 가운데에 반전 색(surface-inverse)으로 뜹니다.

- `Toast`: `message`, `tone`(아이콘만 달라짐), `action`(되돌리기 등 버튼 하나), `onClose`, `position`, `inline`.
- `useToast()` → `{ show(message, { tone, action, duration }), node }` — `node`를 트리 어딘가에 렌더합니다.
- 과거형 한 문장: "저장했어요". 오류라도 사용자가 할 일이 있다면 Banner나 인라인 오류로.
