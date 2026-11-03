# 화면 패턴

컴포넌트를 조합하는 기본 틀입니다. 새 화면은 여기서 가장 가까운 틀을 고른 뒤 필요한 만큼만 바꿉니다.

## 모바일 — 질문형 입력 화면

한 화면에 질문 하나, 입력 하나.

1. `AppBar`(뒤로 버튼만, 제목 없음)
2. `title-2` 질문 헤드라인 — "휴대폰 번호를 알려 주세요" — 위 `space-24`, 아래 `space-32`
3. `TextField size="lg"` 하나(필요하면 둘까지), 좌우 `space-20`
4. 하단 고정 `Button variant="primary" size="xl" fullWidth` — "다음". 키보드가 올라오면 키보드 위에 붙입니다.

## 모바일 — 설정·목록

- `bg-subtle` 배경 위에 `List inset` 그룹을 `space-24` 간격으로 쌓습니다. 그룹마다 `header`.
- 행은 `ListRow` — 이동은 `chevron`, 즉시 토글은 `Switch`, 현재 값은 `value`.
- 파괴적 행동(로그아웃, 탈퇴)은 마지막 그룹에 따로, `danger-text` 글자색 행으로.

## 데스크톱 — 앱 셸

- 왼쪽 `Sidebar`(248), 오른쪽 본문. 본문 상단 56px 헤더에 `Breadcrumb` 또는 `title-3` 제목 + 오른쪽 도구(`Button size="sm"`, `IconButton`).
- 본문 좌우 `space-32`, 최대 폭 `container-lg`.
- 전역 검색은 `⌘K`(`Kbd`로 표시) — Modal 안 SearchField + 결과 List.

## 데스크톱 — 목록 페이지

1. 제목 줄: `title-1` + 오른쪽 Primary 버튼 하나("새 프로젝트")
2. 도구 줄: `SearchField` + `Tag` 필터 + 오른쪽 `SegmentedControl`(목록/격자) 또는 정렬 `Select sm`
3. `Table`(선택 가능) — 선택하면 도구 줄이 일괄 작업 줄로 바뀝니다("3개 선택됨 · 삭제 · 이동")
4. 하단 `Pagination`, 결과가 없으면 `EmptyState`

## 날짜·파일·검색 입력

- 기간 조회: 목록 위 도구 줄에 `DatePicker mode="range"` + `presets`(오늘 · 최근 7일 · 이번 달). 기본값은 가장 자주 보는 기간으로 채워 둡니다.
- 예약·일정: 날짜가 핵심인 화면은 팝오버 대신 `Calendar`를 펼쳐 두고, 아래에 `TimePicker`.
- 첨부: 폼 끝에 `FileUpload` 드롭존. 허용 형식·최대 용량을 설명에 적고, 올리는 중엔 제출 버튼을 `loading`으로.
- 사람·태그 고르기: 선택지가 많으면 `Combobox`(여럿이면 `multiple`). 인증: 질문형 제목 + `PinInput` + "다시 받기" 링크.

## 대시보드

- 맨 위 `Stat` 3–4개를 `Card padding="sm"` 안에 한 줄로.
- 그 아래 차트 카드 2열(`bp-md` 이상), 모바일은 1열.
- 카드 제목은 `headline`, 기간 전환은 카드 오른쪽 위 `SegmentedControl size="sm"`.

## 확인과 피드백

- 되돌릴 수 있는 행동: 바로 실행하고 `Toast`로 "휴지통으로 옮겼어요 · 되돌리기".
- 되돌릴 수 없는 행동: `Modal size="sm"`로 확인 — 제목 질문형, 본문에 영향 범위(개수·대상), [취소][삭제하기(danger)].
- 계속 유효한 경고(용량 부족, 결제 실패): 페이지 상단 `Banner`.
