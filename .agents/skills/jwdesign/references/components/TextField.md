# TextField

한 줄 텍스트 입력. 레이블·헬퍼·오류 메시지를 한 덩어리로 묶습니다.

## Props
`label`, `helper`, `error`(문자열이면 오류 상태 + 메시지), `required`, `size`(`sm` 32 · `md` 40 · `lg` 48), `prefix` / `suffix`(단위, 도메인), `leftIcon`, `clearable`, 나머지는 `<input>` 속성. `value`+`onChange`(제어) 또는 `defaultValue`(비제어).

## 규칙
- 레이블은 항상 보이게 둡니다. 플레이스홀더는 예시일 뿐 레이블 대신 쓰지 않습니다.
- 오류 문구는 무엇이 문제인지 + 어떻게 고칠지: "이메일 형식이 올바르지 않아요."
- 오류는 blur 또는 제출 시점에 보여 주고, 입력 중에는 방해하지 않습니다.
- 숫자 입력은 `inputMode="numeric"`, 단위는 `suffix`로.
