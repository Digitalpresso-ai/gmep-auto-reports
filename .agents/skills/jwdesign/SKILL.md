---
name: jwdesign
description: jwdesign — 송지웅(Digitalpresso)의 범용 제품 UI 디자인 시스템. Toss/Apple/Linear 풍의 절제된 미니멀 UI, Pretendard 폰트, 브랜드 그린(#07854A), 라이트·다크 테마, 55개 React 컴포넌트, 디자인 토큰(CSS 변수·Tailwind·DTCG). 웹/앱 화면, 대시보드, 폼, 관리자 페이지, 랜딩, 컴포넌트, 목업을 만들거나 고칠 때, 또는 사용자가 "jwdesign", "내 디자인 시스템", "우리 디자인 시스템"을 언급할 때 사용. Use for any UI/frontend work in the user's projects unless another design system is specified.
---

# jwdesign 디자인 시스템

도메인에 묶이지 않는 범용 제품 UI 시스템입니다. **한 화면에 한 가지 일, 넉넉한 여백, 절제된 색, Pretendard 한 가족으로 만드는 선명한 위계.** 브랜드 색은 그린 하나, 블루는 정보(info) 전용입니다.

이 파일은 요약과 규칙입니다. 작업 전에 필요한 만큼만 아래를 더 읽으세요.

| 필요할 때 | 읽을 파일 |
|---|---|
| 색·타입·간격·말투 등 전체 규칙 | `references/brand-book.md` |
| 토큰 값(라이트/다크 해석값, 용도) | `references/tokens.md` |
| 특정 컴포넌트의 props·사용 규칙 | `references/components/<Name>.md` |
| 화면 조합 틀(질문형 입력, 설정, 앱 셸, 목록, 대시보드) | `references/patterns.md` |
| 컴포넌트 API 타입 | `assets/components/jwdesign.d.ts` |

## 1. 프로젝트 스택별 적용법

먼저 프로젝트가 무엇을 쓰는지 확인하고 **하나만** 고르세요. 모든 경우 `assets/tokens/tokens.css`(또는 같은 값)가 출발점입니다.

**A. React 18+ (가장 완전)**
- 가장 빠른 길: `tokens.css` → `jwdesign.css` → React/ReactDOM → `jwdesign.js` 순으로 로드하면 `window.jwdesign.Button` 등 55개 컴포넌트를 바로 씁니다. 예시: `examples/components/*.html`.
- 번들러 프로젝트(Vite/Next 등): `assets/components/src/index.tsx` + `icons.json`을 프로젝트로 복사하고, 맨 위 `const React = window.React;`를 `import * as React from 'react';`로 바꿉니다. `jwdesign.css`, `tokens.css`, `fonts/`도 함께 복사하고 전역으로 import 합니다. Next.js에서는 오버레이·입력 컴포넌트 파일에 `'use client'`를 붙입니다.
- 타입은 `jwdesign.d.ts`를 참고합니다(정식 타입 파일로 써도 됩니다).

**B. Tailwind CSS**
- v4 (권장): `@import "tailwindcss"; @import "<path>/tokens.jw.css"; @import "<path>/tailwind.theme.jw.css";` — 토큰이 `--jw-*` 접두사로 들어가 Tailwind 네임스페이스(`--radius-*`, `--shadow-*`, `--font-*`)와 충돌하지 않습니다. `bg-surface text-text-primary border-border bg-accent text-on-accent rounded-md shadow-md text-body p-16` 같은 유틸리티와 `focus-ring` 유틸리티가 생깁니다. 다크 모드는 조상 요소에 `class="dark"` 또는 `data-theme="dark"`.
- 기존 프로젝트에 자체 색 이름(예: `canvas`, `text-muted`)이 있으면 이름은 두고 값만 jwdesign 변수로 연결합니다: `@theme inline { --color-canvas: var(--jw-bg); … }`. 매핑표를 프로젝트 문서에 남깁니다.
- v4 비접두사 버전: `tokens.css` + `tailwind.theme.css`(Tailwind 기본 팔레트를 비움). `tokens.css`는 반드시 레이어 밖에서 import.
- v3: `presets: [require('<path>/tailwind.preset.cjs')]` + `tokens.css` 전역 로드. 다크 모드는 `data-theme="dark"` 셀렉터.
- 컴포넌트는 `references/components/*.md`의 규칙과 `jwdesign.css`의 값을 그대로 옮겨 구현합니다.

**C. 순수 HTML/CSS 또는 다른 프레임워크(Vue, Svelte, Angular)**
- `tokens.css` + `jwdesign.css`를 로드하고 `jw-*` 클래스 마크업을 씁니다. 마크업 구조는 `src/index.tsx`의 JSX가 정답입니다(예: 버튼 = `button.jw-btn.jw-btn--primary.jw-btn--md > span.jw-btn__content > span.jw-btn__label`).
- 상태 있는 컴포넌트(DatePicker, Combobox, Modal 등)는 해당 프레임워크로 다시 구현하되, 클래스명·키보드 동작·ARIA는 `src/index.tsx`를 따릅니다.

**D. 네이티브(React Native, Flutter, SwiftUI, Compose) / 디자인 툴**
- `assets/tokens/tokens.json`(원본) 또는 `tokens.dtcg.json`(W3C DTCG — Style Dictionary, Tokens Studio, Figma 변수용)에서 값을 가져와 플랫폼 테마로 변환합니다. 색은 반드시 시맨틱 토큰 이름을 유지합니다.
- 폰트 파일: `assets/fonts/PretendardVariable.woff2`(웹). 네이티브는 Pretendard OTF/TTF를 공식 배포처에서 받아 씁니다.

테마: `<html data-theme="light|dark">`. 속성이 없으면 `prefers-color-scheme`을 따릅니다.

## 2. 반드시 지킬 규칙

**색**
- 화면은 항상 **시맨틱 토큰**으로 칠합니다: `bg`, `bg-subtle`, `surface`, `surface-raised`, `fill`, `text-primary/secondary/tertiary`, `border`, `accent`, `info`, `success`, `warning`, `danger`… `gray-500` 같은 원시 스케일이나 임의 hex를 UI에 직접 쓰지 않습니다(다크 모드가 깨집니다).
- 채움 그린(`accent`, Primary 버튼)은 **한 화면에 하나**. 나머지 행동은 `secondary`/`weak`/`outline`/`ghost`.
- 안내·진행 중·새 기능은 `info`(블루). 성공은 그린 계열이므로 **반드시 아이콘이나 단어와 함께**. 모든 상태는 색만으로 전달하지 않습니다.
- 채움 위 글자는 `on-accent`/`on-danger`, 연한 배경 위 글자는 짝이 되는 `*-text`. 새 조합을 만들면 대비 4.5:1(큰 글자·아이콘·테두리 3:1)을 확인합니다.
- 금지: 그라디언트, 네온, 글래스모피즘(고정 헤더 블러 예외), 이모지, 색 있는 왼쪽 테두리 카드, 큰 면적의 원색 배경.

**타이포그래피**
- 모든 글자 Pretendard(`--font-sans`), 코드·키·ID는 JetBrains Mono(`--font-mono`). Inter/Roboto 등으로 바꾸지 않습니다.
- 스타일은 토큰 이름으로: `display-1/2`, `title-1/2/3`, `headline`, `body-lg`/`body`(15/24, 기본)/`body-sm`, `label-lg`/`label`/`label-sm`, `caption`/`caption-sm`, `code`. CSS 클래스는 `.type-<name>`.
- 위계는 크기보다 굵기(700/600/400)와 색 단계로. 큰 글자일수록 음의 자간. 숫자 비교 영역은 `tabular-nums`.

**간격·모서리·깊이**
- 4px 그리드, 토큰 이름의 숫자 = px(`space-8`, `space-16`, `space-24`…). 임의 값 금지.
- 반경은 컨테이너 크기에 비례: `radius-xs` 4 → `sm` 6 → `md` 10(기본 컨트롤) → `lg` 14(카드·큰 버튼) → `xl` 20(모달) → `2xl` 28(시트). 알약(`radius-full`)은 배지·칩·스위치·아바타·진행바에만.
- 경계는 1px `border`가 먼저. 그림자는 떠 있는 면(메뉴·모달·토스트)에만: `shadow-md`, `shadow-lg`.
- 포커스는 `:focus-visible`에만 `focus-ring` 토큰.

**모션**: 80–360ms, `transform`/`opacity`만, 등장 `ease-out`, 누르면 `scale(0.98)`, `prefers-reduced-motion` 존중.

**말투(UX 라이팅, 한국어)**
- 해요체: "저장했어요", "다시 시도해 주세요". 능동형·사용자 관점.
- 버튼은 결과를 말하는 동사: "삭제하기", "보내기", "다음"(단순 "확인" 지양).
- 모달·시트·풀스크린 입력의 제목은 질문형: "어떤 계정으로 로그인할까요?"
- 오류 = 무엇이 + 어떻게: "이메일 형식이 올바르지 않아요."
- 숫자 천 단위 쉼표(12,480,000원), 날짜 "2026년 9월 25일", 시간 "오후 3:42". 느낌표·과장어 금지.

**데이터 형식**: 날짜 `'YYYY-MM-DD'`, 시간 `'HH:mm'` 문자열로 주고받고, 표시는 `jwdesign.formatDate` / `formatTime` / `formatBytes`.

**아이콘**: Phosphor Icons Bold 한 세트만(`Icon` 컴포넌트에 72종 내장, SVG는 `assets/icons/`). 16/20/24px. 다른 아이콘 세트와 섞지 않고, 새 아이콘이 필요하면 같은 Phosphor Bold에서 가져옵니다.

## 3. 컴포넌트 카탈로그 (55)

| 그룹 | 컴포넌트 | 요약 |
|---|---|---|
| Foundations | [`Icon`](references/components/Icon.md) | Phosphor Icons Bold(MIT) 중 64종을 내장한 SVG 아이콘. |
| Actions | [`Button`](references/components/Button.md) | 사용자가 무언가를 실행하게 하는 기본 컨트롤. |
| Actions | [`IconButton`](references/components/IconButton.md) | 아이콘 하나로 의미가 분명한 행동(닫기, 더보기, 알림)을 위한 정사각 버튼. |
| Actions | [`ButtonGroup`](references/components/ButtonGroup.md) | 두세 개의 버튼을 8px 간격으로 묶습니다. |
| Actions | [`Link`](references/components/Link.md) | 문장 안에서 다른 페이지로 이동하는 텍스트 링크. |
| Forms | [`TextField`](references/components/TextField.md) | 한 줄 텍스트 입력. |
| Forms | [`SearchField`](references/components/SearchField.md) | 검색 전용 입력. |
| Forms | [`TextArea`](references/components/TextArea.md) | 여러 줄 입력. |
| Forms | [`Select`](references/components/Select.md) | 선택지 5–15개 중 하나를 고르는 네이티브 셀렉트. |
| Forms | [`Checkbox`](references/components/Checkbox.md) | 독립적인 여러 항목을 켜고 끄는 선택. |
| Forms | [`Radio`](references/components/Radio.md) | 서로 배타적인 2–5개 선택지. |
| Forms | [`Switch`](references/components/Switch.md) | 누르는 즉시 적용되는 켜기/끄기. |
| Forms | [`SegmentedControl`](references/components/SegmentedControl.md) | 같은 내용을 다르게 보여 주는 2–5개 보기 전환(기간, 정렬, 보기 방식). |
| Forms | [`Slider`](references/components/Slider.md) | 범위 안의 근사값을 고를 때. |
| Forms | [`Calendar`](references/components/Calendar.md) | 한 달 달력. |
| Forms | [`DatePicker`](references/components/DatePicker.md) | 입력창을 누르면 달력 팝오버가 열리는 날짜 선택. |
| Forms | [`TimePicker`](references/components/TimePicker.md) | 정해진 간격의 시간 목록에서 고르는 선택기. |
| Forms | [`FileUpload`](references/components/FileUpload.md) | 파일을 끌어다 놓거나 골라서 올리는 영역과, 올린 파일 목록(진행률·완료·오류·삭제). |
| Forms | [`Combobox`](references/components/Combobox.md) | 입력해서 걸러 고르는 선택. |
| Forms | [`NumberInput`](references/components/NumberInput.md) | 작은 범위의 정수를 −/+로 조절하는 입력(수량, 인원, 반복 횟수). |
| Forms | [`PinInput`](references/components/PinInput.md) | 인증번호·간편 비밀번호처럼 자리 수가 정해진 숫자 입력. |
| Forms | [`PasswordField`](references/components/PasswordField.md) | 보기/숨기기 토글이 붙은 비밀번호 입력. |
| Data display | [`Badge`](references/components/Badge.md) | 상태·분류를 한두 단어로 표시하는 읽기 전용 라벨. |
| Data display | [`Tag`](references/components/Tag.md) | 필터 선택, 입력된 값(키워드·수신자) 표시에 쓰는 알약 모양 칩. |
| Data display | [`Avatar`](references/components/Avatar.md) | 사람·팀을 나타내는 원형 이미지. |
| Data display | [`Card`](references/components/Card.md) | 관련 정보를 하나의 면으로 묶는 컨테이너. |
| Data display | [`ListRow`](references/components/ListRow.md) | 설정·연락처·거래 내역처럼 같은 모양이 반복되는 목록의 한 줄. |
| Data display | [`Table`](references/components/Table.md) | 비교·정렬이 필요한 여러 속성의 데이터. |
| Data display | [`Stat`](references/components/Stat.md) | 대시보드의 핵심 숫자 하나(KPI). |
| Data display | [`Divider`](references/components/Divider.md) | 1px 헤어라인(`border`). |
| Data display | [`Kbd`](references/components/Kbd.md) | 키보드 단축키 표시. |
| Data display | [`Tooltip`](references/components/Tooltip.md) | 아이콘 버튼의 이름, 잘린 텍스트의 전체 내용처럼 짧은 보충 설명. |
| Data display | [`DescriptionList`](references/components/DescriptionList.md) | 항목 이름과 값의 쌍(상세 정보, 영수증, 설정 요약). |
| Data display | [`TreeView`](references/components/TreeView.md) | 폴더·카테고리·조직도처럼 계층이 있는 목록. |
| Data display | [`CodeBlock`](references/components/CodeBlock.md) | 코드, 명령어, API 키처럼 그대로 복사해야 하는 텍스트. |
| Feedback | [`Banner`](references/components/Banner.md) | 페이지·섹션 안에 머무는 알림(Callout). |
| Feedback | [`Toast`](references/components/Toast.md) | 행동 결과를 3초 동안 알리는 짧은 메시지. |
| Feedback | [`Progress`](references/components/Progress.md) | 진행률 막대. |
| Feedback | [`Spinner`](references/components/Spinner.md) | 짧은 대기(1–3초)를 알리는 회전 표시. |
| Feedback | [`Skeleton`](references/components/Skeleton.md) | 불러올 콘텐츠의 자리를 미리 보여 주는 회색 블록. |
| Feedback | [`EmptyState`](references/components/EmptyState.md) | 목록·검색 결과가 비었을 때. |
| Overlays | [`Modal`](references/components/Modal.md) | 흐름을 멈추고 확인·짧은 입력을 받는 대화상자. |
| Overlays | [`BottomSheet`](references/components/BottomSheet.md) | 모바일에서 아래에서 올라오는 시트. |
| Overlays | [`Menu`](references/components/Menu.md) | 버튼에 딸린 행동 목록. |
| Overlays | [`Popover`](references/components/Popover.md) | 트리거 옆에 뜨는 작은 패널. |
| Overlays | [`Drawer`](references/components/Drawer.md) | 데스크톱에서 오른쪽(또는 왼쪽)에서 밀려 나오는 패널. |
| Overlays | [`CommandPalette`](references/components/CommandPalette.md) | ⌘K(Windows는 Ctrl+K)로 여는 전역 검색·명령 실행 창. |
| Navigation | [`Tabs`](references/components/Tabs.md) | 같은 맥락 안에서 다른 콘텐츠 영역으로 전환. |
| Navigation | [`Breadcrumb`](references/components/Breadcrumb.md) | 깊은 계층의 현재 위치. |
| Navigation | [`Pagination`](references/components/Pagination.md) | 페이지 단위 목록 이동. |
| Navigation | [`Stepper`](references/components/Stepper.md) | 여러 단계로 나뉜 흐름에서 현재 위치. |
| Navigation | [`Accordion`](references/components/Accordion.md) | 자주 묻는 질문, 긴 설정의 접이식 섹션. |
| Navigation | [`AppBar`](references/components/AppBar.md) | 모바일 상단 바. |
| Navigation | [`Sidebar`](references/components/Sidebar.md) | 데스크톱 앱의 주 내비게이션(248px). |
| Navigation | [`BottomNav`](references/components/BottomNav.md) | 모바일 앱 최상위 3–5개 목적지. |

## 4. 자주 쓰는 조합

- 설정 화면 = `bg-subtle` + `List inset` + `ListRow`(+ `Switch` / `chevron`)
- 폼 = `TextField` 세로 나열(`space-24`) + 하단 `Button variant="primary" size="xl" fullWidth`
- 확인 = `Modal size="sm"` [취소][행동하기]
- 목록 = `SearchField` + `Tag` 필터 + `Table`/`List` + `Pagination`/`EmptyState`
- 기간 조회 = `DatePicker mode="range"` + `presets` · 첨부 = `FileUpload` · 상세 = `Drawer` + `DescriptionList` · 전역 이동 = `CommandPalette`(⌘K)
- 앱 셸: 데스크톱 `Sidebar` + 본문, 모바일 `AppBar` + `BottomNav`

## 5. 끝내기 전 점검

- [ ] 색은 전부 시맨틱 토큰인가? 임의 hex·원시 스케일·Tailwind 기본 팔레트가 없는가?
- [ ] 채움 Primary가 한 화면에 하나인가? 파랑을 행동 색으로 쓰지 않았는가?
- [ ] 폰트가 Pretendard이고, 타입 스타일이 토큰 이름에 맞는가?
- [ ] 간격·반경이 토큰 값(4px 그리드)인가?
- [ ] 라이트·다크 둘 다에서 읽히는가(`data-theme="dark"`로 확인)?
- [ ] 문구가 해요체·동사형 버튼·질문형 제목인가? 이모지·느낌표가 없는가?
- [ ] 키보드로 모든 컨트롤에 닿고 포커스 링이 보이는가? 아이콘 버튼에 `label`이 있는가?
- [ ] 로딩·빈 상태·오류 상태가 있는가(Skeleton / EmptyState / Banner·인라인 오류)?

## 파일 지도

```
jwdesign/
├── SKILL.md                     ← 지금 이 파일
├── references/
│   ├── brand-book.md            전체 규칙(원칙·말투·색·타입·간격·모션·아이콘·접근성)
│   ├── tokens.md                토큰 표(라이트/다크 해석값)
│   ├── patterns.md              화면 패턴
│   └── components/<Name>.md     컴포넌트별 가이드 55개
├── assets/
│   ├── tokens/                  tokens.json(원본) · tokens.css · tokens.jw.css(--jw- 접두사) · tokens.dtcg.json · tailwind.theme(.jw).css(v4) · tailwind.preset.cjs(v3)
│   ├── components/              jwdesign.js(UMD, window.jwdesign) · jwdesign.css · jwdesign.d.ts · src/index.tsx · src/icons.json
│   ├── fonts/                   PretendardVariable.woff2 · JetBrainsMono-latin-wght.woff2 · LICENSE.txt
│   ├── icons/                   Phosphor Bold SVG 72종(currentColor)
│   └── vendor/                  react / react-dom 18 UMD(예제·오프라인용)
└── scripts/build_tokens.py      tokens.json → 모든 파생 토큰 파일 재생성
```
