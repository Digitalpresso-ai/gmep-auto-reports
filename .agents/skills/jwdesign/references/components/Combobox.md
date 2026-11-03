# Combobox

입력해서 걸러 고르는 선택. 선택지가 많거나(16개 이상) 사람·태그처럼 검색이 자연스러운 경우에 Select 대신 씁니다.

- `options`: 문자열 또는 `{value, label, description, icon, disabled}`, `value`/`defaultValue`, `onChange`, `multiple`(선택값이 입력창 안 Tag로, Backspace로 마지막 삭제), `creatable`(목록에 없는 값 추가), `placeholder`, `emptyText`, `size`.
- ↑↓로 이동, Enter로 선택, Esc로 닫기. 결과가 없으면 `emptyText`("일치하는 항목이 없어요").
- 서버 검색이 필요하면 `options`를 입력에 따라 갈아 끼우세요(250ms 디바운스 권장).
