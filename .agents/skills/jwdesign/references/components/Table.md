# Table

비교·정렬이 필요한 여러 속성의 데이터. 속성이 2개 이하이면 ListRow가 낫습니다.

- `columns`: `{key, title, width, align, numeric, sortable, sortValue(row), render(row)}`, `rows`, `rowKey`, `selectable` + `selected`/`onSelectChange`, `density`(`sm` 36 · `md` 48 · `lg` 60), `empty`.
- 숫자 열은 오른쪽 정렬 + `numeric`(고정폭 숫자). 단위는 셀 안에.
- 세로 구분선 없이 가로 헤어라인만. 헤더는 bg-subtle.
