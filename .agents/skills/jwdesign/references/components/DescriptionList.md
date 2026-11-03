# DescriptionList

항목 이름과 값의 쌍(상세 정보, 영수증, 설정 요약). 표보다 가볍고 ListRow보다 조밀합니다.

- `items`: `{term, description, copyable, copyValue}`, `layout`: `horizontal`(왼쪽 이름 120px, 기본) | `vertical`(위 이름), `columns`.
- 값이 숫자·금액이면 고정폭 숫자로 정렬됩니다. 복사할 일이 잦은 값(주문 번호, 계좌)엔 `copyable`.
