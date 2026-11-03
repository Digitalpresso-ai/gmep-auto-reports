# TreeView

폴더·카테고리·조직도처럼 계층이 있는 목록. 한 단계 들여쓰기는 20px.

- `items`: `{id, label, icon, meta, children}`, `defaultExpanded`(id 배열), `selected`/`defaultSelected`, `onSelect(id)`.
- 키보드: ↑↓ 이동, → 펼치기/자식으로, ← 접기/부모로, Enter 선택. 폴더 아이콘은 펼침 상태를 따라 바뀝니다.
- 3단계보다 깊어지면 Breadcrumb + 목록 화면으로 나누는 것을 고려합니다.
