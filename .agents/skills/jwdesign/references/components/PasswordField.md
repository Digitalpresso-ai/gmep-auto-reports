# PasswordField

보기/숨기기 토글이 붙은 비밀번호 입력. 가입·변경 화면에선 강도 표시를 켭니다.

- TextField의 모든 props + `showStrength`(4단계 막대와 "보안 수준 좋음" 문구).
- 강도는 길이·대소문자·숫자·기호로 대략 계산합니다(`jwdesign.passwordStrength(pw)` → 0–4). 서버 정책이 따로 있으면 그 기준을 helper에 적습니다.
- 로그인 화면엔 강도 표시를 쓰지 않습니다. `autoComplete`는 가입 시 `new-password`.
