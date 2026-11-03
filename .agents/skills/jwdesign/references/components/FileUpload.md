# FileUpload

파일을 끌어다 놓거나 골라서 올리는 영역과, 올린 파일 목록(진행률·완료·오류·삭제).

- `variant`: `dropzone`(기본) | `button`(좁은 폼의 "파일 첨부"), `label`, `description`(허용 형식·용량), `accept`, `multiple`, `maxSize`(바이트 — 넘으면 해당 파일이 오류 상태), `maxFiles`, `disabled`, `error`.
- 목록: `files`/`defaultFiles` + `onFilesChange`. 항목은 `{id, name, size, type, status: 'ready'|'uploading'|'done'|'error', progress, error, file}`.
- 실제 전송은 소비자가 합니다: `onSelect(newItems)`에서 업로드를 시작하고, 진행에 따라 `files`의 `status`·`progress`를 갱신하세요.
- 설명엔 허용 형식과 최대 용량을 꼭 적습니다. 오류 문구는 이유 + 기준: "10MB보다 큰 파일은 올릴 수 없어요".
- `jwdesign.formatBytes(n)`으로 크기를 표시합니다.
