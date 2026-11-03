# PinInput

인증번호·간편 비밀번호처럼 자리 수가 정해진 숫자 입력. 자리마다 칸이 있고, 입력하면 다음 칸으로 넘어갑니다.

- `length`(기본 6), `value`/`defaultValue`, `onChange`, `onComplete(code)`(마지막 자리 입력 시), `mask`, `error`, `label`(접근성 이름, 기본 "인증번호").
- 붙여넣기로 한 번에 채워지고, 첫 칸은 `autocomplete="one-time-code"`라 모바일 SMS 자동 채움이 됩니다.
- 위에 "문자로 받은 6자리 숫자를 입력해 주세요" 같은 `title-2` 질문을, 아래에 "다시 받기" 링크와 남은 시간을 둡니다.
