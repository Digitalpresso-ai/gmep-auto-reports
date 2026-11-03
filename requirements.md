# 요구사항

원문: [개발 지시서 PDF](GMEP%20일일%20출장보고서%20작성기%20—%20외부%20배포%20개발%20지시서.pdf) (2026-11-03, @주형). 근거 열의 `p.N §x`는 이 PDF의 쪽·절이다.
상태: 미구현 · 구현 중 · 검증됨 · 미검증 · 결정 대기. 검증됨은 연결된 검사가 현재 코드에서 통과한 경우에만 쓰며 사용자 수용과 별개다.
단계: 1차 = 11/6(금) 오픈, 2차 = 11/11(수) (p.5 §6-1).

## 로그인·계정·권한

| ID | 조건·기대 결과 | 근거 | 단계 | 구현·검사 위치 | 상태 |
|---|---|---|---|---|---|
| AUTH-1 | 로그인 화면은 회사명 드롭다운 + 비밀번호. 회원가입·이메일 인증 없음, 회사 1개 = 계정 1개 | p.1 §2 | 1차 | `src/app/api/auth/login`, `src/client/company/Login.tsx` / `tests/api/auth.test.ts` | 검증됨(API). 화면은 로컬 브라우저 확인 |
| AUTH-2 | 드롭다운은 19개사(COMP-1). "주식회사·(주)"를 뒤로 보낸 가나다순 표시(예: 디지털프레소(주)) | p.6 §6-4 | 1차 | `src/server/domain/company-name.ts`, `src/app/api/companies` / `tests/domain/company-name.test.ts`, `tests/api/auth.test.ts` | 검증됨 |
| AUTH-3 | 관리자가 회사별 초기 비밀번호 발급. 최초 로그인 시 8자 이상 새 비밀번호로 변경 강제 | p.1 §2 | 1차 | `src/server/auth.ts`, `src/app/api/auth/password`, `src/app/api/admin/companies/[id]/password` / `tests/api/auth.test.ts`, `tests/api/admin.test.ts`, `tests/api/company.test.ts` | 검증됨 |
| AUTH-4 | 비밀번호는 bcrypt 또는 argon2 해시만 저장. 평문 저장·로그 출력 금지 | p.1 §2 | 1차 | `src/server/auth.ts`(bcrypt) / `tests/api/auth.test.ts` | 검증됨 |
| AUTH-5 | 로그인 5회 연속 실패 시 15분 잠금 | p.1 §2, p.5 §6-2 | 1차 | `src/server/domain/login-lock.ts`, `src/server/auth.ts` / `tests/domain/login-lock.test.ts`, `tests/api/auth.test.ts` | 검증됨 |
| AUTH-6 | 관리자가 비밀번호 초기화 → 다시 최초 로그인 흐름(AUTH-3) | p.1 §2 | 2차 | `src/server/companies.ts` issueInitialPassword(재발급) / `tests/api/admin.test.ts` | 구현 중(1차의 초기 비밀번호 발급 API를 재발급에도 씀) |
| AUTH-11 | 로그인한 회사가 언제든 비밀번호 변경(현재 비밀번호 확인, 8자 이상) | 2026-11-03 사용자 답변("비밀번호 변경 기능 넣자") | 1차 | `src/server/auth.ts`, `src/client/company/PasswordForm.tsx` / `tests/api/auth.test.ts` | 검증됨 |
| AUTH-12 | 관리자는 별도 주소 `/admin`에서 관리자 비밀번호로 로그인. 회사 드롭다운에는 관리자 항목이 없음(디지털프레소 회사 계정과 분리) | 2026-11-03 사용자 답변("별도 주소 /admin") | 1차 | `src/app/api/admin/*`, `src/app/admin`, `scripts/set-admin-password.ts`(`npm run admin:password`) / `tests/api/admin.test.ts` | 검증됨(API). 관리자 비밀번호 설정은 사람이 실행 |
| AUTH-7 | 세션은 httpOnly·Secure 쿠키, 유효기간 14일, 로그아웃 버튼 | p.2 §2 | 1차 | `src/server/auth.ts`, `src/server/http.ts` / `tests/api/auth.test.ts` | 검증됨(Secure는 production에서만 붙음) |
| AUTH-8 | 회사 계정은 자기 회사의 회사정보·기안문·보고서·사진만 조회·수정. 다른 회사 id를 넣은 API 직접 호출도 거부 | p.2 §2, p.5 §5-3, p.5 §6-2 | 1차 | `requireCompany`(세션 company_id만 사용), `resolvePhotos` / `tests/api/company.test.ts`, `report.test.ts`, `docx.test.ts`, `admin.test.ts` | 검증됨 |
| AUTH-9 | 관리자 권한: 회사 추가·수정, 비밀번호 초기화, 회사별 AI 사용량·한도 조정, 전체 사용량 조회. 회사 추가는 관리자 페이지에서 쉽게(1차) | p.2 §2, 2026-11-03 사용자 인터뷰("쉽게 추가할 수 있게 관리자 페이지 필요") | 1차(회사 추가)·2차(나머지) | `src/app/api/admin/companies`, `src/client/admin/Companies.tsx` / `tests/api/admin.test.ts` | 구현 중(1차 회사 추가·이름 수정·비밀번호 발급 검증됨, 한도 조정·사용량 조회는 2차) |
| AUTH-10 | 관리자도 회사별 보고서·사진·기안문 내용은 열람 불가(목록·건수만) | p.2 §2 | 2차 | `listCompaniesForAdmin`(내용 필드 없음) / `tests/api/admin.test.ts` | 검증됨(관리자 API에 내용 조회 없음). 건수 화면은 2차 |

## 보고서 작성 기능

| ID | 조건·기대 결과 | 근거 | 단계 | 구현·검사 위치 | 상태 |
|---|---|---|---|---|---|
| FUNC-1 | 회사명·출장자·회사 소개 입력, 사전 출장 기안문(PDF·DOCX) 업로드. 최초 1회 등록, 로그인 시 자동 불러오기, '기안문 내용 보기'. 원본 파일도 보관해 그 회사만 다시 내려받음. 회사 소개(정체성)는 항목 구분 없는 자유 텍스트 하나, 최대 5,000자 | p.2 §3, 2026-11-03 사용자 인터뷰("텍스트 필드로 자유롭게… 글자 수 제한 넉넉히"), 2026-11-03 사용자 답변("pdf 저장 추가하자") | 1차 | `src/app/api/company`, `src/app/api/company/proposal/*`, `src/client/company/CompanyInfo.tsx` / `tests/api/company.test.ts`, `tests/db/migration.test.ts` | 검증됨(API). 실제 Storage 업로드 미검증 |
| FUNC-2 | 보고 일자 선택, 기본값 오늘(KST) | p.2 §3 | 1차 | `src/server/domain/dates.ts`, `src/client/api.ts` / `tests/domain/dates.test.ts` | 검증됨 |
| FUNC-3 | ZIP 자동 분류는 회사 화면에서 빼고 관리자 공통 자료 등록(SHARED-1)에서 사용. 분류 규칙: 이미지 → 사진, 파일명에 일정·schedule·agenda 포함 → 일정, 나머지 문서 → 교육자료. 동영상은 무시. ZIP은 브라우저에서 풀고 필요한 파일만 전송 | p.2 §3, p.4 §5-2, 2026-11-03 사용자 인터뷰 | 1차(SHARED-1로 이동) | `src/lib/classify.ts`, `src/client/admin/DayEditor.tsx` / `tests/domain/classify.test.ts` | 검증됨(규칙). ZIP 브라우저 처리는 합성 ZIP으로 로컬 확인 |
| FUNC-4 | 운영사 일정: 회사 화면에는 그날 공통 일정(SHARED-2)이 복사본 텍스트로 채워지고 회사가 자유 편집. 공통 일정 이미지는 AI에 이미지 블록으로 전달(최대 8장) | p.2 §3, p.3 §4-1, 2026-11-03 사용자 인터뷰("복사본 자유 편집") | 1차 | `src/server/workspace.ts`, `src/server/generate.ts` / `tests/api/company.test.ts`, `tests/api/report.test.ts` | 검증됨 |
| FUNC-5 | 교육자료는 관리자가 공통으로 등록(SHARED-1). 텍스트는 브라우저에서 추출(pdf.js·JSZip)해 AI에는 추출 텍스트만 보냄. 원본 파일은 Storage에 보관하고 로그인한 모든 회사가 내려받음. 회사는 교육자료를 추가하지 않음. 회사별 생성마다 교육자료 원문 텍스트를 AI에 전달(공통 요약 재사용 안 함, 45,000자 상한 AI-8) | p.2 §3, p.4 §5-1, 2026-11-03 사용자 인터뷰("회사별 생성마다 원문 전달"), 2026-11-03 사용자 답변("pdf 저장 추가하자", 범위 "기안문+교육자료", 다운로드 "로그인한 모든 회사") — p.4 §5-1 "교육자료 원본 미저장"을 바꿈 | 1차 | `src/server/generate.ts`, `src/server/originals.ts`, `src/app/api/admin/days/[date]/materials/*` / `tests/api/report.test.ts`, `tests/api/admin.test.ts` | 검증됨(API). 실제 Storage 업로드 미검증 |
| FUNC-6 | 참여 사진: 그날 공통 사진(SHARED-3)과 회사가 추가 업로드한 사진 중에서 눌러서 선택, 선택 순서 번호 표시. 후보 4장 이하는 자동 선택. 업로드 전 1,100px로 축소 | p.2 §3, 2026-11-03 사용자 인터뷰 | 1차 | `src/server/workspace.ts`, `src/client/company/Workspace.tsx`, `src/client/files.ts` / `tests/api/company.test.ts` | 구현 중(선택 순서 저장·회사별 분리 검증됨. 자동 선택·1,100px 축소는 브라우저 코드, 실기 미검증) |
| FUNC-7 | 특이사항(별도 성과·별도 미팅) 자유 입력 → 보고서의 별도 섹션 | p.2 §3 | 1차 | `src/server/workspace.ts`, `src/server/domain/prompt.ts` / `tests/api/report.test.ts` | 검증됨 |
| FUNC-8 | 보고서 생성: AI 호출 → JSON → 미리보기. 항목: 기본정보, 일정·수행내용, 세부 교육내용, 주요 성과, 특이사항, 시사점·향후계획, 참여 사진, 첨부 | p.2 §3 | 1차 | `src/server/generate.ts`, `src/server/domain/report.ts` / `tests/api/report.test.ts`, `tests/domain/report.test.ts` | 검증됨(가짜 AI 응답). 실제 AI 호출 미검증 |
| FUNC-9 | 미리보기 문장 직접 수정(contenteditable), 자동 저장 | p.2 §3 | 1차 | `src/server/sanitize.ts`, `PUT /api/days/[date]/report` / `tests/api/report.test.ts` | 검증됨 |
| FUNC-10 | 수정 요청 입력 → AI 재작성. 사용자가 직접 고친 내용은 유지 | p.2 §3 | 2차 | — | 미구현 |
| FUNC-11 | 일일 보고서 .docx 다운로드(사진 포함). 맑은 고딕, A4, □ · - 개조식 불릿. Word·한글(HWP 뷰어)에서 깨짐 없이 열림 | p.2 §3, p.5 §6-2 | 1차 | `src/server/docx.ts`, `src/app/api/days/[date]/report/docx` / `tests/api/docx.test.ts` | 구현 중(검사 통과, LibreOffice로 열림 확인. Word·한글 실기 미검증) |
| FUNC-12 | 보관함: 날짜별 보고서 카드, 다시 열기, 확인 후 삭제. 같은 날짜 재생성 시 덮어쓰기 | p.2 §3 | 2차 | — | 미구현 |
| FUNC-13 | 전체 합본: 저장된 일일 보고서를 날짜순으로 .docx 한 파일에 합침 | p.3 §3 | 2차 | — | 미구현 |
| FUNC-14 | 작성 규칙(프로토타입 문구 재사용): 모든 문장 개조식, "~습니다" 등 서술형 어미 금지 / 입력에 없는 사실(미팅 상대·계약·수치) 생성 금지 / 시사점은 회사 사업·제품 관점 / 참여 사진은 설명 없이 사진만 | p.3 §3 | 1차 | `src/server/domain/prompt.ts` / `tests/domain/report.test.ts` | 구현 중(문구 이전 검증됨. 실제 출력의 개조식 유지는 미검증) |
| FUNC-15 | PC·모바일 모두 사용. 아이폰 Safari·갤럭시 Chrome에서 사진 업로드·선택·다운로드 | p.3 §3, p.5 §6-2 | 1차 | `src/app/globals.css`, `src/client/*` (모바일 폭·서버 첨부 다운로드) | 미검증(375px 폭 로컬 확인, 아이폰·갤럭시 실기 미검증) |
| FUNC-16 | 디지털프레소 로고 표시: 로그인 화면·상단 헤더. 파일은 `public/brand/`(digitalpresso-design 자산). Word 보고서에는 넣지 않음 | 2026-11-03 사용자 요청("디지털프레소 로고가 들어가야 함"), 답변 "화면에만" | 1차 | `src/client/company/Login.tsx`, `CompanyApp.tsx`, `src/client/admin/AdminApp.tsx` | 미검증(로컬 화면 확인) |
| FUNC-17 | 생성 전 입력(일정 복사본·사진 선택·추가 사진·특이사항)은 회사·날짜별 초안으로 서버에 자동 저장. 다른 기기·재방문 시 그대로 복원 | 2026-11-03 사용자 답변("날짜별 자동 저장"), SHARED-2 | 1차 | `src/server/workspace.ts`, `PUT /api/days/[date]/draft` / `tests/api/company.test.ts` | 검증됨 |
| FUNC-18 | 같은 날짜 보고서가 있으면 '다시 만들기' 전에 "직접 고친 내용이 사라집니다" 확인. 확인 시 덮어쓰고 생성 1회 차감 | 2026-11-03 사용자 답변("덮어쓰기 확인 후 생성"), FUNC-12 | 1차 | `src/server/generate.ts`, `src/client/company/Workspace.tsx` / `tests/api/report.test.ts` | 검증됨 |
| FUNC-X | 범위 제외: 구글 드라이브 직접 연동(ZIP으로 대체), HWP 읽기 | p.3 §3 | — | — | 제외 |

## 날짜별 공통 자료

사진·일정표·교육자료는 운영사가 모든 참가기업에 같은 것을 준다. 관리자가 날짜마다 한 번 등록하고 회사는 그 위에서 고친다(2026-11-03 사용자 인터뷰, 지시서의 회사별 ZIP 업로드를 대체).

| ID | 조건·기대 결과 | 근거 | 단계 | 구현·검사 위치 | 상태 |
|---|---|---|---|---|---|
| SHARED-1 | 관리자가 보고 일자별 공통 자료를 등록·수정: ZIP 넣기(FUNC-3 분류 규칙) + 일정 텍스트 붙여넣기 + 일정 이미지·PDF + 교육자료 + 사진 | 2026-11-03 사용자 인터뷰("관리자 날짜별 1회 등록") | 1차 | `src/server/shared-days.ts`, `src/app/api/admin/days/*`, `src/client/admin/DayEditor.tsx` / `tests/api/admin.test.ts`, `tests/db/migration.test.ts` | 검증됨(API) |
| SHARED-2 | 회사가 보고 일자를 고르면 그날 공통 일정이 회사별 복사본으로 채워짐. 회사의 편집은 공통 원본과 다른 회사에 영향 없음. 이미 편집한 복사본은 이후 공통 일정이 바뀌어도 그대로 | 2026-11-03 사용자 인터뷰("복사본 자유 편집") | 1차 | `src/server/workspace.ts` / `tests/api/company.test.ts` | 검증됨 |
| SHARED-3 | 공통 사진은 로그인한 모든 회사가 보고 고를 수 있음. 회사가 추가한 사진은 그 회사에만 보임(AUTH-8) | 2026-11-03 사용자 인터뷰 | 1차 | `src/server/workspace.ts`, `src/app/api/days/[date]/photos/*` / `tests/api/company.test.ts` | 검증됨 |
| SHARED-4 | 공통 자료가 없는 날짜도 회사가 일정 직접 입력·사진 추가로 보고서 생성 가능 | 2026-11-03 사용자 답변 "허용" | 1차 | `src/server/workspace.ts`, `src/server/domain/prompt.ts` / `tests/api/company.test.ts`, `tests/domain/report.test.ts` | 검증됨 |

## AI 연동·사용량 제한

| ID | 조건·기대 결과 | 근거 | 단계 | 구현·검사 위치 | 상태 |
|---|---|---|---|---|---|
| AI-1 | 브라우저 → 자체 서버 API → Anthropic Messages API. 브라우저 직접 호출 금지 | p.3 §4-1 | 1차 | `src/server/ai.ts`, `POST /api/days/[date]/report` / `tests/api/report.test.ts` | 검증됨(빌드 번들에 키·서버 코드 없음 확인) |
| AI-2 | API 키는 이 서비스 전용 워크스페이스 키, 서버 환경변수로만 보관 | p.3 §4-1, p.4 §5-3 | 1차 | `src/server/ai.ts`(ANTHROPIC_API_KEY만 읽음) | 미검증(워크스페이스 키 발급은 사람) |
| AI-3 | 기본 모델 claude-sonnet-5-5, 관리자 설정으로 변경 가능 | p.3 §4-1 | 1차(기본값)·2차(관리자 변경) | `src/server/settings.ts` aiModel(app_settings → ANTHROPIC_MODEL → claude-sonnet-5-5) | 구현 중(기본값. 관리자 변경 화면은 2차) |
| AI-4 | 프롬프트는 프로토타입 buildPrompt() 문구를 서버로 이전 | p.3 §4-1 | 1차 | `src/server/domain/prompt.ts` / `tests/domain/report.test.ts` | 검증됨 |
| AI-5 | 출력은 프로토타입 SCHEMA의 JSON 하나. 파싱 실패 시 1회 재시도 후 오류 안내 | p.3 §4-1 | 1차 | `src/server/generate.ts`, `src/server/domain/report.ts` / `tests/api/report.test.ts` | 검증됨 |
| AI-6 | 참여 사진은 AI에 보내지 않음 | p.3 §4-1 | 1차 | `src/server/generate.ts` / `tests/api/report.test.ts` | 검증됨 |
| AI-7 | 1~2분 응답 대비 스트리밍 또는 진행 표시, 서버 타임아웃 3분 이상 | p.3 §4-1 | 1차 | `maxDuration = 300`, `src/server/ai.ts` 280초, `Workspace.tsx` 진행 표시 | 미검증(실제 응답 시간 미측정) |
| AI-8 | 요청 1건 상한: 교육자료 텍스트 합계 45,000자, 기안문 15,000자에서 자름. max_tokens 8,000 | p.3 §4-2 ① | 1차 | `src/server/domain/prompt.ts`, `src/server/ai.ts`(max_tokens 8,000) / `tests/domain/report.test.ts` | 검증됨(자르기). max_tokens는 코드 확인만 |
| AI-9 | 회사별 1일 한도: 생성 5회, 수정 요청 15회(관리자 조정 가능). 화면에 "오늘 남은 생성 3/5회" 표시. 실패한 AI 호출은 횟수에서 차감하지 않음(usage는 AI-12대로 기록) | p.3 §4-2 ②, 2026-11-03 사용자 답변("차감 안 함") | 1차(생성 한도)·2차(조정) | `src/server/usage.ts`, `src/server/generate.ts`(ai_inflight) / `tests/api/report.test.ts` | 검증됨(생성 한도·실패 미차감·동시 생성 거부). 수정 15회는 2차 |
| AI-10 | 회사별 월 토큰 한도(입력+출력). 초과 시 AI 버튼 비활성 + "오늘 사용 한도를 다 쓰셨습니다". 직접 편집·Word 다운로드는 계속 가능 | p.3 §4-2 ② | 1차 | `src/server/domain/usage.ts` / `tests/api/report.test.ts` | 검증됨(한도값은 회사별 monthly_token_limit, 기본 없음) |
| AI-11 | 앱 내부 전체 월 토큰 예산, 80% 도달 시 관리자 메일 알림. 예산 금액은 Anthropic Console 워크스페이스 한도와 같게 둠(D1) | p.4 §4-2 ③, 2026-11-03 사용자 답변 | 2차 | — | 미구현 |
| AI-12 | 호출마다 usage(입력·출력 토큰)를 회사·일시·종류(생성/수정)·모델·성공 여부와 저장 → 관리자 화면에 회사별·일별 표 | p.4 §4-2, p.4 §5-1 | 1차(기록)·2차(화면) | `src/server/usage.ts` recordUsage / `tests/api/report.test.ts` | 검증됨(기록). 관리자 표는 2차 |

## 저장·배포·보안

| ID | 조건·기대 결과 | 근거 | 단계 | 구현·검사 위치 | 상태 |
|---|---|---|---|---|---|
| DATA-1 | 테이블 예시: companies, reports(회사별 날짜 유일), report_photos, ai_usage, login_attempts | p.4 §5-1 | 1차 | `db/migrations/0001~0004` / `tests/db/migration.test.ts` | 검증됨 |
| DATA-2 | 사진은 객체 저장소, 회사별 폴더 분리, 서명 URL로만 제공 | p.4 §5-1 | 1차 | `src/server/storage.ts`, `src/server/photos.ts` / `tests/api/company.test.ts`(가짜 저장소) | 구현 중(회사별 경로·서명 URL 코드. 실제 Supabase 미검증) |
| DATA-3 | 보관 기한은 프로그램 종료일부터 1개월로 고정. 로그인 화면에 안내 문구 표시, 기한 후 일괄 삭제. 종료일 기본값 2026-11-30(11월 마지막 날) → 보관 기한 2026-12-30. 종료일 값은 코드에 고정하지 않고 설정으로 바꿀 수 있게 함 | p.5 §5-3, 2026-11-03 사용자 답변("프로그램 종료일부터 한달로 고정", "11월 마지막일") | 1차(문구)·종료(삭제) | `src/server/settings.ts`, `GET /api/notice`, `Login.tsx` / `tests/api/company.test.ts`, `tests/domain/dates.test.ts` | 구현 중(안내 문구·종료일 설정 검증됨. 일괄 삭제는 종료 시) |
| OPS-1 | Vercel Hobby 배포, HTTPS. 주소 gmep-report.renamedp.ai. 주소는 코드에 고정하지 않고 환경변수 하나로 바꿀 수 있어야 함 | p.4 §5-2, 2026-11-03 사용자 답변 | 1차 | — | 미구현 |
| OPS-2 | 유럽(베를린·헬싱키) 접속 허용, 속도 확인 | p.4 §5-2 | 1차 | — | 미구현 |
| OPS-3 | 업로드 요청당 50MB 이상 허용 또는 ZIP은 브라우저에서 처리 | p.4 §5-2 | 1차 | `src/client/files.ts` unzip, 원본 서명 업로드 URL | 구현 중(ZIP 브라우저 처리 로컬 확인. 서명 업로드는 실제 Supabase 미검증) |
| OPS-4 | 종료 시 데이터 일괄 삭제, API 키 폐기 | p.5 §6-1 | 종료 | — | 미구현 |
| OPS-5 | Anthropic Console 워크스페이스 월 지출 한도 설정 완료 캡처 제출(사람이 수행). 금액은 Console에서 받은 API 한도 | p.4 §4-2 ③, p.5 §6-2, 2026-11-03 사용자 답변 | 1차 | — | 미구현 |

## 참가기업 목록

| ID | 조건·기대 결과 | 근거 | 단계 | 구현·검사 위치 | 상태 |
|---|---|---|---|---|---|
| COMP-1 | 사용자 요청은 20개사, 지시서 명단은 19개사. 초기 데이터 19개사: 주식회사 오션스마트, 주은이엔씨, 주식회사 에스씨에스, 주식회사 써큐러솔루션, 지비오, 주식회사 엠제이코퍼레이션, (주)엘앤에스일렉트로닉스, 주식회사 디지털프레소, 주식회사 스파이더실크, 주식회사 에어로밸런스, 캠핑이너스 주식회사, 주식회사 프롭메이트, 코봇시스템, 주식회사 마이렌, 주식회사 에스비안전, (주)월드리싸이클링, SafeAI, 공존, 주식회사 긱토. 관리자가 추가 가능 | p.6 §6-4 | 1차 | `db/migrations/0003_seed_companies.sql` / `tests/db/migration.test.ts` | 검증됨 |
| COMP-2 | 회사명 오탈자는 운영사 명단과 대조 후 확정. 발견하면 관리자 페이지 회사 수정(AUTH-9)으로 고침 | p.6 §6-4, 2026-11-03 사용자 답변 "D7 맞아" | 1차 | `PATCH /api/admin/companies/[id]` / `tests/api/admin.test.ts` | 검증됨 |

## 검수 기준(p.5 §6-2) ↔ 요구

| 검수 항목 | 연결 요구 |
|---|---|
| 19개사 드롭다운 로그인, 최초 비번 변경, 5회 실패 잠금 | AUTH-1~5 |
| A사 로그인 상태에서 B사 데이터 조회 불가(API 직접 호출로도) | AUTH-8 |
| 실제 11/2 자료로 보고서 생성 성공, 개조식 유지 | FUNC-8, FUNC-14 (자료: `data/` ZIP, 커밋 제외) |
| .docx가 Word·한글에서 깨짐 없이 열림, 사진 포함 | FUNC-11 |
| 한도 초과 시 차단·안내, 관리자 화면 토큰 집계 | AI-9, AI-10, AI-12 |
| 아이폰 Safari·갤럭시 Chrome 사진 업로드·선택·다운로드 | FUNC-15 |
| Console 월 지출 한도 설정 캡처 | OPS-5 |

## 결정 대기

| ID | 질문 | 영향 요구 | 근거 | 답변·출처 |
|---|---|---|---|---|
| D1 | 월 AI 예산 상한(원), Console spend limit 금액 | OPS-5, AI-11 | p.5 §6-3 | Anthropic이 주는 API 한도만큼(2026-11-03 사용자 답변). 별도 금액 없음 |
| D2 | 회사별 한도 생성 1일 5회·수정 15회 안을 그대로 쓰는지 | AI-9 | p.5 §6-3 | 지시서대로 생성 5회·수정 15회(2026-11-03 사용자 답변 "지시서 대로 가자") |
| D3 | 데이터 보관 기한(안: 2026-12-31) | DATA-3, OPS-4 | p.5 §6-3 | 프로그램 종료일부터 1개월(2026-11-03 사용자 답변, 앞선 "2달" 답변을 정정). 종료일 2026-11-30 |
| D4 | 접속 주소(도메인) | OPS-1 | p.5 §6-3 | gmep-report.renamedp.ai, 쉽게 바꿀 수 있게(2026-11-03 사용자 답변) |
| D5 | 초기 비밀번호 전달 방법 | AUTH-3 | p.5 §6-3 | 관리자가 만들어 직접 전달, 회사 비밀번호 변경 기능 추가(AUTH-11) (2026-11-03 사용자 답변) |
| D6 | 개발·배포 스택과 폴더 구조 | 전체 | p.4 §5-2, [시니어 개발자 인터뷰](.agents/skills/proofstill-engineer/SKILL.md) | Next.js + Supabase (2026-11-03 사용자 답변 "Next.js+Supabase"). Supabase CLI 미사용. 폴더는 AGENTS.md "스택과 폴더" |
| D7 | 운영사 명단 대조 후 회사명 확정 | COMP-1, AUTH-2 | p.6 §6-4 | 20번째 회사명은 미정. 19개사로 시작하고 관리자 페이지에서 추가(2026-11-03 사용자 인터뷰). 오탈자는 발견 시 관리자 페이지에서 수정(2026-11-03 사용자 답변 "D7 맞아") |
| D8 | Vercel 요금제(Hobby는 비상업 용도 한정, 함수 최대 300초) | OPS-1, AI-7 | [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) | Hobby. 판매하지 않는 무상 서비스라 괜찮다고 판단(2026-11-03 사용자 답변). AI-7의 3분 타임아웃은 300초 안에 들어감 |

## 제공 자료

- 프로토타입 원본: [prototype/GMEP_보고서작성기_프로토타입.html](prototype/GMEP_보고서작성기_프로토타입.html). `SCHEMA`·`buildPrompt()`는 이 파일 771행 부근이며 AI-4, AI-5, FUNC-5, FUNC-11의 재사용 근거다.
