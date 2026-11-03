# Calendar

한 달 달력. DatePicker 안에서 쓰이고, 예약·일정 화면처럼 달력이 항상 보여야 할 때는 단독으로 둡니다.

- `mode`: `single` | `range`, `value`/`defaultValue`(`'YYYY-MM-DD'` 문자열, range는 `[시작, 끝]`), `onChange`, `min`/`max`, `isDisabled(date)`, `month`(처음 보여 줄 달).
- 날짜는 시간대 문제를 피하려고 항상 `YYYY-MM-DD` 문자열로 주고받습니다. `jwdesign.formatDate(d, 'long'|'short'|'dot')`로 표시합니다.
- 일요일은 `danger-text`, 토요일은 `info-text`, 오늘은 테두리, 선택은 `accent` 채움, 기간은 `accent-soft` 띠.
- 방향키로 날짜 이동, Enter로 선택. 선택 불가 날짜는 취소선.
