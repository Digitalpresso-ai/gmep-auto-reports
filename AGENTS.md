# GMEP 일일 출장보고서 작성기

- 요구의 원문은 [개발 지시서 PDF](GMEP%20일일%20출장보고서%20작성기%20—%20외부%20배포%20개발%20지시서.pdf)다. 요구 ID·근거·구현/검사 위치·상태는 [requirements.md](requirements.md)에 모은다. 원문은 수정하지 않는다.
- 모든 구현 작업자는 [커밋 스킬](.agents/skills/proofstill-commit/SKILL.md)을 따른다. 작은 관심사 하나의 구현·관련 검사·빌드가 끝나면 즉시 로컬 커밋한 뒤 다음 관심사로 이동한다. 마지막에 변경을 모아 hunk로 나누지 않는다. 위임 시에도 스킬·담당 파일·검사·커밋 시점을 전달하고 공유 index의 stage·커밋은 직렬화한다. 읽기 전용 검증자는 커밋하지 않으며 push·이력 재작성은 별도 요청 범위다.
- 사람은 의도와 수용을, 에이전트는 위임받은 조사·구현·검증을 책임진다.
- 개발·검증은 [개발 스킬](.agents/skills/proofstill-develop/SKILL.md)과 [독립 검증 스킬](.agents/skills/proofstill-verify/SKILL.md)을 따른다. CLI는 `python3 .proofstill-runtime/bin/proofstill --root . --help`이며 독립 리뷰(`review`)에는 로그인한 Codex CLI가 필요하다. 공유 로컬 파일에 대한 보안 격리를 제공하지는 않는다.
- 새 프로젝트나 중요한 기술 변경은 [시니어 개발자 인터뷰](.agents/skills/proofstill-engineer/SKILL.md)로 구현 가능성과 아키텍처를 사용자와 논의한다. 스택·폴더 구조는 사용자 결정을 받은 뒤 확정하고 생성·구현한다. 확정 전에는 제품 디렉터리·패키지 설치를 하지 않는다.
- API 계약·OpenAPI·API Tracker 작업은 [proofstill-api](.agents/skills/proofstill-api/SKILL.md), DB 스키마·migration은 [proofstill-db](.agents/skills/proofstill-db/SKILL.md)를 따른다.
- UI는 [jwdesign](.agents/skills/jwdesign/SKILL.md) 토큰과 컴포넌트를 우선하고 화면 구성에 [design-taste-frontend](.agents/skills/design-taste-frontend/SKILL.md)를 적용한다. 충돌 시 jwdesign을 따른다. UI 변경은 요청한 화면·행동에 필요한 최소 범위로 제한한다. 프로토타입 화면 구성은 재사용 대상이다.

## 스택과 폴더
- Next.js 16(App Router) + Vercel + Supabase(PostgreSQL·Storage). 2026-11-03 사용자 선택. Next.js 16은 이전 버전과 API·규칙이 다르다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 안내를 읽고 deprecation 안내를 따른다.
- `src/app`: 화면과 Route Handler(HTTP 입력·응답). `src/server/domain`: 프레임워크·DB 없는 업무 규칙. 그 밖의 `src/server/*`: DB·Storage·Anthropic 연결과 실행 순서. 브라우저 코드는 `src/server`를 import하지 않는다.
- DB 접근은 서버에서 `postgres` 드라이버로만 한다. 회사 인증은 Supabase Auth를 쓰지 않고 자체 세션 테이블을 사용한다. 모든 테이블은 RLS를 켜고 정책을 두지 않는다.
- migration은 `db/migrations/*.sql`에 순서대로 추가하고 `npm run db:migrate`(`DATABASE_URL` 필요)로 적용한다. Supabase CLI는 쓰지 않는다. 적용한 migration 파일은 고치지 않고 새 파일을 추가한다.
- 검사: `npm run check`(lint → typecheck → 전체 테스트). `test:domain`은 순수 규칙, `test:db`는 Testcontainers PostgreSQL에서 실제 migration·SQL 제약을 확인하며 Docker가 필요하다. Docker 오류를 건너뛰거나 통과로 취급하지 않는다.
- 프로토타입 원본은 `prototype/`에 보존하고 수정하지 않는다. 프롬프트(`buildPrompt`)·`SCHEMA`·파일 읽기·Word 변환 코드는 여기서 옮긴다.

## 이 서비스의 고정 제약
- 회사별 데이터 격리가 최우선이다. 모든 API는 세션의 company_id로 권한을 검사하고, 다른 회사 ID를 넣은 직접 호출도 거부하는 검사를 둔다. 관리자도 보고서·사진·기안문 내용은 열람할 수 없다.
- Anthropic API 키·DB 비밀번호는 서버 환경변수로만 다룬다. 저장소·로그·브라우저 번들에 넣지 않는다. 브라우저에서 Anthropic API를 직접 호출하지 않는다.
- 비밀번호는 해시로만 저장하고 평문을 로그에 남기지 않는다.
- `data/`의 실제 참가기업 자료는 커밋하지 않고 외부 서비스로 보내지 않는다. 검수용 실제 AI 호출은 사용자가 요청한 경우에만 한다. 테스트는 가짜 AI 응답과 합성 fixture를 사용한다.
- 배포·도메인·Anthropic Console 설정·초기 비밀번호 전달은 사람이 수행하거나 별도 승인을 받는다.

## 작업 기록
- 작업 상태는 `.proofstill/work/<작업ID>/brief.md`에 짧게 유지한다. 목표·제약·다음 행동·미정 결정·진행 및 검증 상태를 갱신하며, 대화나 메모리만으로 이어가지 않는다. 재개할 때 brief와 실제 코드·실행 결과를 대조한다.
- 임시 기록은 현재 상태만 담고 장문 일지로 쌓지 않는다. 영구 문서는 사용자가 요청하거나 제출에 필수일 때만 만든다. 이 파일에는 다음 세션에도 필요한 협업 규칙만 남긴다.
- 주석과 문서에는 코드만으로 알기 어려운 의도·이유·제약만 남긴다.

## 협업
- 먼저 요청과 관련 자료를 읽고, 대화에는 `할 일 / 지킬 조건 / 바로 할 일`을 짧게 전달한다. 필요한 결정이 있을 때만 덧붙인다.
- 조사로 알아낼 것은 직접 확인한다. 이미 명확하게 맡긴 작업은 재승인 없이 진행한다. 미정 결정에 의존하지 않는 작업은 계속한다.
- 목표·우선순위·성공 기준·비용·보관 기한을 바꾸거나 위임 범위를 넘는 결정은 사람에게 근거·선택지·추천을 제시한다. 무응답은 승인이 아니다.
- 명확한 요구는 즉시 구현하고 업무 해석이 달라지는 조건만 확인한다. 로그인 → 입력 → AI 생성 → 저장 → 조회/Word 다운로드 흐름을 일찍 연결하고, 추가 요청은 영향받는 요구·코드·검사부터 갱신한다.
- 새로운 업무 동작은 실패할 행동 테스트를 먼저 작성하고 Red를 확인한 뒤 구현해 Green으로 만든다. import·환경 오류를 행동 검증으로 대신하지 않는다.
- 검증은 기능 묶음 단위로 한다. 구현 중에는 필요한 관련 검사만 실행하고, 중요한 동작 변경의 최종 검사·독립 리뷰는 수정을 모아 한 번 수행한다. 문구·문서·스타일 등 낮은 위험의 작은 수정은 직접 확인으로 끝낼 수 있다.
- 완료 시 변경 내용·실제 검사 결과·미검증과 한계를 짧게 전달한다. 관찰과 추측을 구분하고 미실행을 통과로 보고하지 않는다. 에이전트의 검증 완료와 사용자의 수용은 구분한다.
