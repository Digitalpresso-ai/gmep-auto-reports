# jwdesign 브랜드북

도메인에 묶이지 않는 범용 제품 UI 시스템입니다. 한 화면에 한 가지 일, 넉넉한 여백, 절제된 색, Pretendard 한 가족으로 만드는 선명한 위계가 핵심입니다. 브랜드 색은 그린 하나입니다. 모바일 앱과 데스크톱 웹 앱 모두에 씁니다.

## 원칙

1. **한 화면, 한 가지 일.** 화면마다 사용자가 끝내야 할 일 하나를 정하고, 그 행동에만 `accent` 채움(Primary 버튼)을 씁니다. 나머지는 `secondary`, `weak`, `ghost`.
2. **색은 의미가 있을 때만.** 화면의 90%는 회색 스케일(`bg`, `surface`, `text-*`, `border`)입니다. 그린(`accent`)은 행동과 선택, 블루(`info`)는 안내, 빨강·주황은 위험·주의에만.
3. **경계는 선으로, 떠 있는 것만 그림자로.** 카드·테이블·입력은 1px `border`. 그림자(`shadow-md`, `shadow-lg`)는 메뉴·모달·토스트처럼 실제로 떠 있는 면에만.
4. **글자 크기보다 굵기와 색으로 위계.** 제목은 700/600, 본문 400. 보조 정보는 크기를 줄이기 전에 `text-secondary` → `text-tertiary`로 한 단계씩 내립니다.
5. **움직임은 보이지 않을 만큼.** 80–360ms, `transform`과 `opacity`만. 누르면 살짝 줄어들고(`scale(0.98)`), 나타날 땐 감속(`ease-out`).

## 콘텐츠와 말투

- **해요체**로 씁니다. "저장했어요", "다시 시도해 주세요". 합쇼체(~습니다)와 반말은 쓰지 않습니다.
- **능동형, 사용자 관점.** "정보가 변경되었습니다" → "정보를 바꿨어요". 시스템이 아니라 사용자가 한 일을 말합니다.
- **버튼은 결과를 말하는 동사.** "확인" 대신 "삭제하기", "보내기", "다음". 취소 버튼은 "취소" 또는 "닫기".
- **질문형 제목.** 모달·바텀시트·풀스크린 입력 화면의 제목은 사용자에게 묻는 한 문장: "어떤 계정으로 로그인할까요?"
- **오류 = 무엇이 + 어떻게.** "이메일 형식이 올바르지 않아요." "네트워크 연결이 끊겼어요. 연결을 확인하고 다시 시도해 주세요." 사용자를 탓하지 않고, 오류 코드는 맨 뒤 `caption`으로만.
- **숫자.** 천 단위 쉼표(12,480,000원), 단위는 붙여 씁니다(3GB, 24시간). 날짜는 "2026년 9월 25일", 조밀한 곳은 "9월 25일", 표에선 "2026.09.25". 시간은 "오후 3:42".
- **느낌표·이모지 없음.** 강조는 굵기와 색으로. 마케팅 문구도 과장어("최고의", "혁신적인") 없이 구체적으로.
- **영문 UI 레이블**이 필요한 곳(배지 NEW, 버전)은 대문자 짧게, 한글과 섞을 땐 한글 기준으로 문장을 씁니다.

## 색

두 층입니다. `gray-*`, `blue-*`, `red-*`, `orange-*`, `green-*` 원시 스케일은 참조용이고, 화면은 **항상 시맨틱 토큰**으로 칠합니다. 라이트/다크 테마가 시맨틱 토큰에서 갈라지므로, 원시 스케일을 직접 쓰면 다크 모드가 깨집니다.

| 역할 | 토큰 |
|---|---|
| 페이지 | `bg` — 흰 바탕. 설정·목록처럼 카드를 올리는 화면은 `bg-subtle`(회색) 위에 `surface` 카드 |
| 면 | `surface`(카드·리스트), `surface-raised`(모달·메뉴·시트), `surface-inverse`(툴팁·토스트) |
| 채움 | `fill` → `fill-hover` → `fill-pressed`(보조 버튼, 칩, 트랙). 투명 요소 hover는 `state-hover`, `state-pressed` |
| 글자 | `text-primary`(본문·제목), `text-secondary`(설명·레이블), `text-tertiary`(힌트·플레이스홀더·시간), `text-disabled`(비활성만) |
| 선 | `border`(헤어라인), `border-strong`(강조 구분, 아웃라인 버튼), `border-control`(입력·체크박스 테두리, 3:1) |
| 강조(브랜드 그린) | `accent`(Primary 채움) + `on-accent`, `accent-soft` + `accent-text`(약한 강조, 선택된 칩), `link`(= `accent-text`), `selected`(선택된 행) |
| 상태 | `info`(블루 — 안내·진행 중·새 기능), `success`, `warning`, `danger` 각각 `-soft`(배경) + `-text`(글자). 채움 버튼은 `danger` + `on-danger` |

- 상태는 **색만으로 알리지 않습니다.** 배지엔 단어, 배너·토스트엔 아이콘, 증감엔 화살표가 함께 있습니다.
- `*-text` 토큰은 bg·surface·해당 `-soft` 위에서 라이트·다크 모두 4.5:1 이상입니다. 다른 조합을 만들면 대비를 확인하세요.
- `success`는 브랜드 그린과 같은 계열입니다. 그래서 성공은 반드시 체크 아이콘이나 "완료" 같은 단어와 함께 쓰고, 중립적인 안내·진행 상태는 그린이 아니라 `info`(블루)로 표시합니다.
- 데이터 시각화 계열색이 필요하면 `green-500`, `blue-500`, `orange-500`, `red-500`, `gray-500` 순서로 쓰고, 선 굵기·패턴·레이블로도 구분합니다.

## 타이포그래피

**Pretendard Variable** 한 가족(45–920 가변 굵기)으로 모든 텍스트를, 코드·키·ID는 **JetBrains Mono**로 씁니다. 두 폰트 모두 `assets/fonts/`에 실제 파일이 들어 있습니다.

- 본문 기본은 `body`(15/24). 모바일 긴 글은 `body-lg`(17/27), 표와 조밀한 UI는 `body-sm`(14/21).
- 화면 제목: 데스크톱 `title-1`(32), 모바일 `title-2`(26). 섹션·모달 제목 `title-3`(22), 카드 제목 `headline`(18).
- 컨트롤 안 글자는 `label` 계열(굵기 600). 메타 정보는 `caption`(13), 배지는 `caption-sm`(12).
- 큰 글자일수록 자간을 좁힙니다: `display-1` -0.03em → `body` -0.006em. 한글 본문에 양의 자간을 주지 않습니다.
- 숫자가 세로로 비교되는 곳(표, 금액, 통계, 타이머)엔 `font-variant-numeric: tabular-nums`를 켭니다 — 컴포넌트는 이미 켜져 있습니다.
- 한 줄 최대 폭은 한글 기준 40–45자(`container-md` 안). 문단 사이는 `space-16`.

## 간격과 레이아웃

- **4px 그리드.** 토큰 이름의 숫자가 곧 px입니다: `space-4`, `space-8`, `space-12`, `space-16`, `space-20`, `space-24`, `space-32`, `space-48`, `space-64`… 임의 값(13px, 18px)을 만들지 않습니다.
- 모바일 화면 좌우 여백 `space-20`, 데스크톱 `space-32`. 카드·모달 안쪽 `space-24`, 조밀하면 `space-16`.
- 관련 요소 `space-8`, 폼 필드 사이 `space-24`, 섹션 사이 `space-48`(모바일) / `space-64`(데스크톱), 랜딩 섹션 `space-96`.
- 폭: 모바일·폼 `container-sm`(480), 문서·설정 `container-md`(768), 대시보드 `container-lg`(1120). 데스크톱 앱은 `sidebar-width`(248) + 본문.
- 브레이크포인트: `bp-md`(768)부터 2열, `bp-lg`(1024)부터 Sidebar 노출.

## 모서리

컨테이너가 클수록 반경도 커집니다. `radius-xs`(4) 체크박스·Kbd → `radius-sm`(6) 작은 버튼·툴팁 → `radius-md`(10) 기본 버튼·입력·메뉴 → `radius-lg`(14) 큰 버튼·카드·배너·토스트 → `radius-xl`(20) 모달 → `radius-2xl`(28) 바텀시트 상단. 알약(`radius-full`)은 배지·칩·스위치·아바타·진행바에만 — 카드나 큰 버튼엔 쓰지 않습니다.

## 깊이와 그림자

- 평면이 기본입니다. 카드는 `border` 1px, 회색 `bg-subtle` 위라면 테두리 없는 `surface`만으로도 충분합니다.
- `shadow-xs` 세그먼트 썸·스위치 핸들, `shadow-sm` hover된 카드, `shadow-md` 메뉴·팝오버·토스트, `shadow-lg` 모달·시트. 라이트 테마 그림자는 불투명도 4–8%.
- 다크 테마는 그림자 대신 면의 밝기로 층을 나눕니다: `bg`(가장 어두움) < `surface` < `surface-raised`, 떠 있는 면엔 1px 흰 5–8% 링이 함께 들어갑니다.
- 딤은 `scrim`. 그라디언트, 글래스모피즘, 네온은 쓰지 않습니다(고정 헤더의 반투명 블러만 예외).

## 상태와 인터랙션

- **hover**: 채움은 한 단계 진하게(`fill` → `fill-hover`, `accent` → `accent-hover`), 투명 요소는 `state-hover` 오버레이.
- **pressed**: `scale(0.98)` + 한 단계 더 진한 채움, `duration-instant`.
- **focus**: 키보드 포커스(`:focus-visible`)만 `focus-ring` — 면 색 2px 간격 + accent 2px 실선, 모든 면 위 3:1 이상. 오류 필드는 `focus-ring-danger`. 마우스 클릭엔 링을 그리지 않습니다.
- **disabled**: 컨트롤 전체 `opacity-disabled`(0.4), 커서 not-allowed. 비활성 이유가 중요하면 헬퍼 텍스트로 설명합니다.
- **loading**: 버튼은 `loading`(폭 유지), 영역은 Skeleton, 1초 이상 걸리는 작업은 Progress.
- **선택**: 목록·테이블 행은 `selected` 배경, 칩은 `accent-soft` + 체크 아이콘.

## 모션

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `duration-instant` | 80ms | pressed, 색 변화 |
| `duration-fast` | 140ms | hover, 툴팁, 체크 |
| `duration-base` | 220ms | 메뉴·탭 인디케이터·스위치 |
| `duration-slow` | 360ms | 모달·시트·토스트 등장 |
| `duration-reveal` | 600ms | 스크롤 진입(opacity 0 + translateY 12px → 원위치, `ease-out`, 목록은 80ms 간격 순차) |

`ease-out`으로 들어오고 `ease-in`으로 나갑니다. 스위치 핸들·체크 표시는 `ease-spring`. `prefers-reduced-motion`이면 모든 전환을 끕니다(`jwdesign.css`에 포함). 레이아웃 속성(`width`, `top`)은 애니메이션하지 않습니다.

## 아이코노그래피

- **Phosphor Icons Bold**(MIT) 한 세트만 씁니다. 72종이 `Icon` 컴포넌트에 내장돼 있고(`jwdesign.iconNames`), 같은 파일이 `assets/icons/`에 SVG(currentColor)로 있습니다.
- 크기는 `icon-sm`(16) 작은 컨트롤·인라인, `icon-md`(20) 기본, `icon-lg`(24) 내비게이션. 16px 미만으로 줄이지 않습니다.
- 색은 `icon-primary`(기본), `icon-secondary`(쉐브런·트레일링·비활성 느낌), 상태 아이콘은 해당 `*-text`. 아이콘은 `currentColor`라 부모의 `color`를 따릅니다.
- 의미 있는 단독 아이콘엔 `label`(또는 IconButton의 `label`)을 붙이고, 텍스트 옆 장식 아이콘은 숨김 처리합니다.
- 이모지는 UI에 쓰지 않습니다. 로고가 필요한 곳은 워드마크 대신 `title-3` 굵기 700의 제품명 텍스트를 씁니다(시스템에 로고 파일 없음).

## 컴포넌트 쓰는 법

- React 18 위에서 `window.jwdesign`로 제공됩니다(`assets/components/jwdesign.js` + `jwdesign.css`, 먼저 `assets/tokens/tokens.css`). 모든 컴포넌트 클래스는 `jw-` 접두사.
- 테마는 `<html data-theme="light|dark">`로 바꿉니다. 시스템 설정을 따르려면 `prefers-color-scheme`에 맞춰 이 속성을 설정하세요.
- 입력 컴포넌트는 제어(`value` + `onChange`)와 비제어(`defaultValue`) 모두 지원합니다.
- 오버레이(Modal, BottomSheet, Toast)는 `document.body`로 포털되고, Esc로 닫히며, 닫히면 포커스를 원래 자리로 돌려놓습니다.
- 자주 쓰는 조합: 설정 화면 = `bg-subtle` + `List inset` + `ListRow`(+ `Switch`/`chevron`). 폼 = `TextField` 세로 나열(`space-24`) + 하단 `Button xl fullWidth primary`. 확인 = `Modal sm`에 [취소][행동하기]. 목록 페이지 = `SearchField` + `Tag` 필터 줄 + `Table` 또는 `List` + `Pagination`/`EmptyState`. 기간 조회 = `DatePicker mode="range"` + `presets`. 첨부 = `FileUpload`(폼 안에서 좁으면 `variant="button"`). 상세 보기 = `Drawer` + `DescriptionList`. 데스크톱 전역 이동 = `CommandPalette`(⌘K).
- 날짜는 `'YYYY-MM-DD'`, 시간은 `'HH:mm'` 문자열로 주고받고, 표시는 `jwdesign.formatDate` · `formatTime` · `formatBytes`로 합니다.

## 접근성

- 텍스트 대비 4.5:1(큰 글자 3:1), 컨트롤 테두리·포커스 링·의미 있는 아이콘 3:1 — 라이트·다크 모두 시맨틱 토큰 조합으로 충족합니다.
- 터치 대상은 최소 40×40(모바일 주요 행동은 48 이상, 하단 CTA는 `control-xl` 56).
- 모든 인터랙티브 요소는 키보드로 도달·조작 가능해야 합니다: Tabs·SegmentedControl·Calendar·TreeView는 방향키, Menu·Combobox·CommandPalette는 ↑↓ + Enter, 오버레이는 Esc.
- 폼 오류는 `aria-invalid` + 메시지 연결(`aria-describedby`)이 컴포넌트에 들어 있습니다. 레이블을 생략하면 `aria-label`을 반드시 넘기세요.
