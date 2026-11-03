# Card

관련 정보를 하나의 면으로 묶는 컨테이너. 테두리가 먼저, 그림자는 필요할 때만.

- `title`, `description`, `action`(오른쪽 위 IconButton 등), `footer`(버튼 줄), `variant`: `outline`(기본) · `filled`(bg-subtle) · `elevated`, `padding`: `sm` 16 · `md` 24 · `lg` 32, `interactive`(카드 전체가 링크/버튼).
- 카드 안에 카드를 넣지 않습니다. 카드 안 버튼은 `sm`.
- 흰 배경 위에서는 `outline`, 회색(bg-subtle) 배경 위에서는 테두리 없는 흰 카드도 좋습니다.
