# CommandPalette

⌘K(Windows는 Ctrl+K)로 여는 전역 검색·명령 실행 창. 데스크톱 앱의 파워 유저용 지름길입니다.

- `open`, `onOpenChange`(주면 ⌘K 단축키가 자동 등록 — `hotkey={false}`로 끔), `groups`: `{title, items: [{label, icon, shortcut, keywords, onSelect}]}`, `placeholder`, `emptyText`.
- `keywords`로 영문·동의어 검색을 받습니다. `shortcut`은 공백으로 나눈 키("⌘ N").
- 모든 기능은 화면의 버튼으로도 할 수 있어야 합니다 — 팔레트는 지름길이지 유일한 길이 아닙니다.
