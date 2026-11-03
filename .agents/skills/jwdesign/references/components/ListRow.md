# List / ListRow

설정·연락처·거래 내역처럼 같은 모양이 반복되는 목록의 한 줄. 이 시스템에서 가장 자주 쓰는 컴포넌트입니다.

- `ListRow`: `title`, `description`, `leading`(Icon 이름 문자열 → 회색 사각 아이콘, 또는 Avatar 등 노드), `trailing`(Switch, Badge…), `value`(오른쪽 회색 값), `chevron`, `onClick`/`href`, `disabled`.
- `List`: `header`(섹션 제목), `inset`(둥근 테두리 그룹 — bg-subtle 위에서).
- 구분선은 텍스트 시작점부터(왼쪽 20px 들여쓰기). 최소 높이 56px.
