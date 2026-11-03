# NumberInput

작은 범위의 정수를 −/+로 조절하는 입력(수량, 인원, 반복 횟수). 직접 입력도 됩니다.

- `value`/`defaultValue`, `onChange(number)`, `min`, `max`, `step`, `suffix`(단위), `size`, `label`, `helper`, `error`.
- ↑↓ 키로 조절. 범위 끝에서 해당 버튼이 비활성됩니다. 금액처럼 큰 수는 TextField + `suffix`.
