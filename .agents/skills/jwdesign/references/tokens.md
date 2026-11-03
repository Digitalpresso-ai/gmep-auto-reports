# jwdesign tokens

Generated from `assets/tokens/tokens.json`. CSS variable = `--<name>`. Light/Dark are resolved hex values.

## Semantic colors

| token | light | dark | usage |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0C0D0F` | 페이지 기본 배경. |
| `bg-subtle` | `#F5F6F8` | `#131519` | 그룹 배경(설정·목록 화면의 회색 바탕), 사이드바, 테이블 헤더. |
| `surface` | `#FFFFFF` | `#131519` | 카드, 리스트 컨테이너, 입력 필드 바탕. |
| `surface-raised` | `#FFFFFF` | `#1B1E23` | 떠 있는 면: 모달, 바텀시트, 메뉴, 팝오버, 토스트. |
| `surface-inverse` | `#1B1E23` | `#EEF0F3` | 툴팁 등 반전 면. 위 텍스트는 text-inverse. |
| `fill` | `#EEF0F3` | `#24282E` | 중립 채움: 보조 버튼, 칩, 세그먼트 트랙, 스켈레톤, 진행바 트랙. |
| `fill-hover` | `#E3E6EA` | `#2F343B` | fill 위 hover 상태. |
| `fill-pressed` | `#CDD2D8` | `#464D57` | fill 위 pressed 상태. |
| `state-hover` | `#1315190D` | `#FFFFFF0F` | 투명 버튼·리스트 행 hover 오버레이. |
| `state-pressed` | `#1315191A` | `#FFFFFF1A` | 투명 버튼·리스트 행 pressed 오버레이. |
| `selected` | `#EBF8F1` | `#07854A29` | 선택된 행·메뉴 항목 배경. 위 텍스트는 text-primary 또는 accent-text. |
| `border` | `#E3E6EA` | `#FFFFFF14` | 구분선, 카드·테이블 헤어라인(1px). 장식용 경계(대비 요건 없음). |
| `border-strong` | `#CDD2D8` | `#FFFFFF24` | 강조 구분선, 비활성 입력 테두리. |
| `border-control` | `#7D8590` | `#6A727D` | 입력·체크박스·라디오 테두리. surface·bg-subtle 위 3:1 이상. |
| `text-primary` | `#191C21` | `#EEF0F3` | 본문과 제목. bg, bg-subtle, surface, surface-raised, fill 위에서 사용. |
| `text-secondary` | `#4E5662` | `#A9B0B9` | 보조 설명, 레이블, 메타 정보. bg, bg-subtle, surface, surface-raised, fill 위에서 사용. |
| `text-tertiary` | `#666E7A` | `#8B939D` | 힌트, 플레이스홀더, 타임스탬프. bg, bg-subtle, surface, surface-raised 위(4.5:1 이상). |
| `text-disabled` | `#A7AEB7` | `#4B525C` | 비활성 텍스트 전용(WCAG 대비 예외). 정보 전달에 쓰지 않습니다. |
| `text-inverse` | `#FFFFFF` | `#131519` | surface-inverse 위 텍스트. |
| `icon-primary` | `#3A414B` | `#C9CED5` | 기본 아이콘. 모든 면 위 3:1 이상. |
| `icon-secondary` | `#7D8590` | `#7A828D` | 보조 아이콘(쉐브런, 트레일링 아이콘). bg, surface 위 3:1 이상. |
| `accent` | `#07854A` | `#07854A` | 주요 행동(Primary 버튼), 선택된 컨트롤, 진행바. 위 텍스트는 on-accent. |
| `accent-hover` | `#06763F` | `#06763F` | accent 채움 hover. |
| `accent-pressed` | `#056535` | `#056535` | accent 채움 pressed. |
| `accent-soft` | `#EBF8F1` | `#0A2E1D` | 연한 강조 배경: Weak 버튼, 선택 칩, 브랜드 배지. 위 텍스트는 accent-text. |
| `accent-soft-hover` | `#D3F1E0` | `#0F3B26` | accent-soft hover. |
| `accent-text` | `#06763F` | `#4CD08A` | 링크, 강조 텍스트. bg, bg-subtle, surface, surface-raised, accent-soft 위. |
| `on-accent` | `#FFFFFF` | `#FFFFFF` | accent 채움 위 텍스트·아이콘(Primary 버튼 레이블). |
| `danger` | `#C8323A` | `#C8323A` | 파괴적 행동 버튼 채움, 오류 테두리. 위 텍스트는 on-danger. |
| `danger-hover` | `#A1262F` | `#A1262F` | danger 채움 hover. |
| `danger-soft` | `#FEF0F0` | `#3D1418` | 오류 배너·배지 배경. 위 텍스트는 danger-text. |
| `danger-text` | `#B42A33` | `#FF7B7B` | 오류 메시지. bg, surface, surface-raised, danger-soft 위. |
| `on-danger` | `#FFFFFF` | `#FFFFFF` | danger 채움 위 텍스트. |
| `warning` | `#D17A00` | `#FFB547` | 주의 아이콘·표시점. bg, surface 위 3:1 이상. 텍스트는 warning-text. |
| `warning-soft` | `#FFF6E5` | `#3A2605` | 주의 배너·배지 배경. 위 텍스트는 warning-text. |
| `warning-text` | `#8F5000` | `#FFC266` | 주의 메시지. bg, surface, warning-soft 위. |
| `success` | `#07854A` | `#4CD08A` | 성공 아이콘·표시점, 켜진 상태 점. 브랜드 그린과 같은 계열 — 성공은 항상 아이콘·단어와 함께. 텍스트는 success-text. |
| `success-soft` | `#EBF8F1` | `#0A2E1D` | 성공 배너·배지 배경. 위 텍스트는 success-text. |
| `success-text` | `#06763F` | `#4CD08A` | 성공 메시지. bg, surface, success-soft 위. |
| `info` | `#2F6BF0` | `#6FA0FF` | 정보 아이콘·표시점(중립적인 안내, 새 기능, 진행 중). 텍스트는 info-text. |
| `info-soft` | `#EEF4FF` | `#15254A` | 정보 배너·배지 배경. 위 텍스트는 info-text. |
| `info-text` | `#2458D6` | `#6FA0FF` | 정보 메시지. bg, surface, surface-raised, info-soft 위. |
| `scrim` | `#0C0D0F66` | `#000000A3` | 모달·바텀시트 뒤 딤 처리. |
| `link` | `#06763F` | `#4CD08A` | 텍스트 링크 — accent-text의 별칭. |

## Primitive scales (reference only — never paint UI with these directly)

| token | value |
|---|---|
| `gray-0` | `#FFFFFF` |
| `gray-25` | `#FAFAFB` |
| `gray-50` | `#F5F6F8` |
| `gray-100` | `#EEF0F3` |
| `gray-200` | `#E3E6EA` |
| `gray-300` | `#CDD2D8` |
| `gray-400` | `#A7AEB7` |
| `gray-500` | `#7D8590` |
| `gray-600` | `#5F6772` |
| `gray-700` | `#464D57` |
| `gray-800` | `#2F343B` |
| `gray-850` | `#24282E` |
| `gray-900` | `#1B1E23` |
| `gray-950` | `#131519` |
| `gray-1000` | `#0C0D0F` |
| `blue-50` | `#EEF4FF` |
| `blue-100` | `#DCE8FF` |
| `blue-200` | `#B8D0FF` |
| `blue-300` | `#8AB2FF` |
| `blue-400` | `#6FA0FF` |
| `blue-500` | `#2F6BF0` |
| `blue-600` | `#285FDC` |
| `blue-700` | `#2253C2` |
| `blue-800` | `#1B3F91` |
| `blue-900` | `#15254A` |
| `red-50` | `#FEF0F0` |
| `red-100` | `#FDDCDC` |
| `red-300` | `#F59A9A` |
| `red-400` | `#FF7B7B` |
| `red-500` | `#E5484D` |
| `red-600` | `#C8323A` |
| `red-700` | `#A1262F` |
| `red-900` | `#3D1418` |
| `orange-50` | `#FFF6E5` |
| `orange-100` | `#FFEBC2` |
| `orange-300` | `#FFC266` |
| `orange-400` | `#FFB547` |
| `orange-500` | `#F59100` |
| `orange-600` | `#B86A00` |
| `orange-700` | `#8F5000` |
| `orange-900` | `#3A2605` |
| `green-50` | `#EBF8F1` |
| `green-100` | `#D3F1E0` |
| `green-200` | `#A8E3C3` |
| `green-300` | `#8ADBB0` |
| `green-400` | `#4CD08A` |
| `green-500` | `#07854A` |
| `green-600` | `#06763F` |
| `green-700` | `#056535` |
| `green-800` | `#064D2A` |
| `green-900` | `#0A2E1D` |

## Typography

Families: `--font-sans`: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif · `--font-mono`: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace

| style (class `.type-<name>`) | size / line | weight | tracking | usage |
|---|---|---|---|---|
| `display-1` | 56px / 68px | 700 | -0.03em | 랜딩 히어로 헤드라인. |
| `display-2` | 44px / 56px | 700 | -0.025em | 섹션 히어로, 큰 숫자 강조. |
| `title-1` | 32px / 42px | 700 | -0.022em | 페이지 제목(데스크톱). |
| `title-2` | 26px / 35px | 700 | -0.02em | 페이지 제목(모바일), 풀스크린 질문형 헤드라인. |
| `title-3` | 22px / 31px | 600 | -0.018em | 섹션 제목, 모달·바텀시트 제목. |
| `headline` | 18px / 27px | 600 | -0.012em | 카드 제목, 작은 섹션 제목. |
| `body-lg` | 17px / 27px | 400 | -0.01em | 모바일 본문, 긴 설명. |
| `body` | 15px / 24px | 400 | -0.006em | 기본 본문, 리스트 제목, 입력값. |
| `body-sm` | 14px / 21px | 400 | -0.004em | 보조 설명, 테이블 셀, 조밀한 UI. |
| `label-lg` | 17px / 24px | 600 | -0.01em | XL·Large 버튼 레이블(하단 고정 CTA). |
| `label` | 15px / 22px | 600 | -0.006em | Medium 버튼, 탭, 세그먼트. |
| `label-sm` | 13px / 18px | 600 | 0 | Small 버튼, 칩, 배지 레이블. |
| `caption` | 13px / 19px | 400 | 0 | 메타데이터, 헬퍼 텍스트, 타임스탬프. |
| `caption-sm` | 12px / 16px | 500 | 0.01em | 배지, 작은 태그, 차트 축. |
| `code` | 13px / 20px | 400 | 0 | 인라인 코드, 코드 블록, 단축키. |
| `code-sm` | 12px / 18px | 500 | 0 | 식별자, 키 캡(Kbd). |

## Shadows

| token | light | dark | usage |
|---|---|---|---|
| `shadow-none` | `none` | `none` | 평면 카드(테두리만). |
| `shadow-xs` | `0 1px 2px #1315190A` | `0 1px 2px #00000066` | 세그먼트 선택 썸, 스위치 핸들, 입력 필드. |
| `shadow-sm` | `0 1px 3px #1315190D, 0 1px 2px #1315190A` | `0 1px 3px #00000080` | hover된 카드. |
| `shadow-md` | `0 4px 16px #1315190F, 0 1px 3px #1315190A` | `0 8px 24px #00000099, 0 0 0 1px #FFFFFF14` | 메뉴, 팝오버, 툴팁, 토스트. |
| `shadow-lg` | `0 16px 48px #13151914, 0 2px 8px #1315190A` | `0 24px 64px #000000B3, 0 0 0 1px #FFFFFF14` | 모달, 바텀시트. |
| `focus-ring` | `0 0 0 2px #FFFFFF, 0 0 0 4px #07854A` | `0 0 0 2px #0C0D0F, 0 0 0 4px #4CD08A` | 키보드 포커스(:focus-visible). 면 색 2px 간격 뒤 accent 2px 실선 — 모든 면 위 3:1 이상. |
| `focus-ring-danger` | `0 0 0 2px #FFFFFF, 0 0 0 4px #C8323A` | `0 0 0 2px #0C0D0F, 0 0 0 4px #FF7B7B` | 오류 상태 입력의 포커스 링. |

## spacing

4px 그리드. 이름의 숫자가 곧 px 값입니다(space-16 = 16px). 2px만 예외적으로 미세 조정용.

| token | value | usage |
|---|---|---|
| `space-0` | `0` | 간격 없음. |
| `space-2` | `2px` | 아이콘과 배지 사이 미세 간격, 포커스 링 오프셋. |
| `space-4` | `4px` | 아이콘–레이블 간격(작은 컨트롤), 칩 내부 세로 여백. |
| `space-6` | `6px` | 아이콘–레이블 간격(버튼). |
| `space-8` | `8px` | 관련 요소 사이, 버튼 그룹 간격, 작은 컨트롤 안쪽. |
| `space-12` | `12px` | 리스트 행 세로 여백, 폼 필드 레이블–입력 간격. |
| `space-16` | `16px` | 컨트롤 좌우 패딩, 카드 안 요소 간격. |
| `space-20` | `20px` | 모바일 화면 좌우 여백(gutter), 카드 패딩(조밀). |
| `space-24` | `24px` | 카드·모달 패딩, 폼 필드 사이. |
| `space-32` | `32px` | 카드 그룹 사이, 데스크톱 gutter. |
| `space-40` | `40px` | 섹션 내부 블록 사이. |
| `space-48` | `48px` | 섹션 사이(모바일). |
| `space-64` | `64px` | 섹션 사이(데스크톱). |
| `space-96` | `96px` | 랜딩 페이지 섹션 사이. |
| `space-128` | `128px` | 히어로 위아래 여백. |

## radius

각은 부드럽되 둥글지 않게. 컨테이너가 클수록 반경도 커지고, 알약 모양은 배지·칩·스위치·아바타에만.

| token | value | usage |
|---|---|---|
| `radius-none` | `0` | 테이블 셀, 풀블리드 이미지. |
| `radius-xs` | `4px` | 체크박스, Kbd, 인라인 코드. |
| `radius-sm` | `6px` | Small 버튼·입력, 툴팁, 메뉴 항목. |
| `radius-md` | `10px` | Medium 버튼·입력, 세그먼트, 드롭다운 메뉴. |
| `radius-lg` | `14px` | Large·XL 버튼, 카드, 토스트, 배너. |
| `radius-xl` | `20px` | 모달 다이얼로그, 큰 카드. |
| `radius-2xl` | `28px` | 바텀시트 상단 모서리. |
| `radius-full` | `9999px` | 배지, 칩, 스위치, 아바타, 진행바. |

## size

컨트롤 높이. 같은 줄에 놓이는 버튼·입력·셀렉트는 같은 size를 씁니다.

| token | value | usage |
|---|---|---|
| `control-xs` | `28px` | XS 버튼, 테이블 안 인라인 액션. |
| `control-sm` | `32px` | Small 버튼·입력, 툴바, 칩. |
| `control-md` | `40px` | 기본 버튼·입력·셀렉트(데스크톱). |
| `control-lg` | `48px` | Large 버튼·입력(모바일 폼). |
| `control-xl` | `56px` | 하단 고정 CTA, 풀폭 주요 버튼. |
| `icon-sm` | `16px` | Small 컨트롤·인라인 아이콘. |
| `icon-md` | `20px` | 기본 아이콘. |
| `icon-lg` | `24px` | 내비게이션·리스트 선행 아이콘. |
| `container-sm` | `480px` | 모바일 앱 폭, 폼·인증 화면. |
| `container-md` | `768px` | 문서·설정 페이지 본문 폭. |
| `container-lg` | `1120px` | 대시보드·랜딩 최대 폭. |
| `sidebar-width` | `248px` | 데스크톱 사이드바. |

## zIndex

겹침 순서. 사이에 임의 값을 끼워 넣지 않습니다.

| token | value | usage |
|---|---|---|
| `z-base` | `0` | 일반 흐름. |
| `z-sticky` | `100` | 고정 헤더, 하단 CTA 바. |
| `z-dropdown` | `1000` | 메뉴, 셀렉트 목록, 팝오버. |
| `z-overlay` | `1300` | 스크림. |
| `z-modal` | `1400` | 모달, 바텀시트. |
| `z-toast` | `1500` | 토스트. |
| `z-tooltip` | `1600` | 툴팁. |

## duration

움직임은 보이지 않을 만큼 짧게. transform·opacity만 애니메이션합니다. prefers-reduced-motion이면 0.

| token | value | usage |
|---|---|---|
| `duration-instant` | `80ms` | pressed 축소, 색 변화. |
| `duration-fast` | `140ms` | hover, 툴팁, 체크 표시. |
| `duration-base` | `220ms` | 메뉴·팝오버 등장, 스위치, 탭 인디케이터. |
| `duration-slow` | `360ms` | 모달·바텀시트 등장, 토스트. |
| `duration-reveal` | `600ms` | 스크롤 진입 페이드업(translateY 12px). |

## easing

대부분 ease-out 계열. 들어올 땐 감속, 나갈 땐 가속.

| token | value | usage |
|---|---|---|
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 상태 전환 기본값. |
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 등장(모달, 시트, 스크롤 진입). |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 퇴장. |
| `ease-spring` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | 스위치 핸들, 체크 표시처럼 작은 탄성. |

## opacity

| token | value | usage |
|---|---|---|
| `opacity-disabled` | `0.4` | 비활성 컨트롤 전체(아이콘·채움 포함). |
| `opacity-muted` | `0.64` | 로딩 중 내용 흐리게. |

## breakpoint

모바일 우선. min-width 기준.

| token | value | usage |
|---|---|---|
| `bp-sm` | `480px` | 큰 폰. |
| `bp-md` | `768px` | 태블릿 — 2열 시작. |
| `bp-lg` | `1024px` | 데스크톱 — 사이드바 노출. |
| `bp-xl` | `1440px` | 와이드. |
