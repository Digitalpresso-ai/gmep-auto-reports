# Modal (Dialog)

흐름을 멈추고 확인·짧은 입력을 받는 대화상자. Esc·배경 클릭으로 닫히고, 열리면 첫 컨트롤에 포커스, 닫히면 원래 위치로 돌아갑니다.

- `open`, `onClose`, `title`, `description`, `children`, `footer`(버튼들), `size`(`sm` 360 · `md` 480 · `lg` 720), `dismissible`(false면 배경·Esc로 닫히지 않음).
- 제목은 질문형: "삭제할까요?". 버튼은 결과를 말합니다: [취소] [삭제하기].
- 모바일에선 BottomSheet를 우선 고려합니다. 모달 위에 모달을 띄우지 않습니다.
