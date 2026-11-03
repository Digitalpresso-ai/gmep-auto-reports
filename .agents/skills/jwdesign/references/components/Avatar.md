# Avatar / AvatarGroup

사람·팀을 나타내는 원형 이미지. 이미지가 없으면 이니셜(한글은 이름 뒤 두 글자), 이름도 없으면 사람 아이콘.

- `name`(색상은 이름으로 고정 결정), `src`, `size`(`xs` 24 · `sm` 32 · `md` 40 · `lg` 56 · `xl` 72), `status`(`online`·`away`·`offline`).
- `AvatarGroup`: `max`를 넘으면 +N으로 줄입니다.
