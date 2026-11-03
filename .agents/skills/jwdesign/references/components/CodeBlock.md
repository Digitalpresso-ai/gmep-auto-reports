# CodeBlock

코드, 명령어, API 키처럼 그대로 복사해야 하는 텍스트. JetBrains Mono, `bg-subtle` 바탕.

- `code`, `title`(파일명) 또는 `language`, `showLineNumbers`, `copyable`(기본 true — 누르면 "복사했어요"로 바뀜), `maxHeight`.
- 구문 색칠은 넣지 않았습니다. 필요하면 소비자가 Prism 등으로 `code` 대신 요소를 렌더하세요.
- 문장 안 짧은 코드는 `<code>`에 `code` 스타일을 씁니다.
