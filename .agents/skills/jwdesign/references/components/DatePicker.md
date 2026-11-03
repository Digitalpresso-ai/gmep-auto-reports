# DatePicker

입력창을 누르면 달력 팝오버가 열리는 날짜 선택. 표시 형식은 "2026년 9월 25일 (금)", 기간은 "2026. 9. 1 – 2026. 9. 30".

- `mode`(`single`|`range`), `value`/`defaultValue`, `onChange`, `label`, `helper`, `error`, `placeholder`, `size`, `min`/`max`, `isDisabled`, `presets`(`[{label, value}]` — 기간 조회 화면의 "최근 7일" 같은 빠른 선택), `disabled`.
- single은 날짜를 누르면 바로 닫히고, range는 끝 날짜를 고르면 닫힙니다. Esc·바깥 클릭으로 닫힙니다.
- 생년월일처럼 먼 과거를 고르는 입력은 달력보다 TextField(`inputMode="numeric"`, 예: 19900101)가 빠릅니다.
