# Proofstill

Node 22.18+와 Python 3.10+가 필요합니다. GitHub 명령에는 Git, 독립 리뷰에는 로그인한 Codex CLI가 필요합니다.

```sh
npx github:jwsong98/proofstill
```

하네스·10개 스킬·Codex 전역 지침이 **즉시 등록**됩니다. **새 Codex 세션**에서 “Proofstill로 프로젝트 만들어줘”라고 요청하면 됩니다. 기존 모델·인증·개인 스킬·지침을 보존하며 변경하는 지침은 백업합니다. 같은 명령을 다시 실행하면 중복 없이 갱신합니다.

0.5.0은 FastAPI·SQLAlchemy ORM, 독립 리뷰 한 번으로 마무리하는 검증 절차, 메모리 DB 기반 CLI flow 검사, UX 상태머신과 전역 설치를 함께 제공합니다. [공개 릴리스](https://github.com/jwsong98/proofstill/releases/tag/v0.5.0)

긴 과제·명세는 원문을 보존하고 `requirements.md` 하나에 요구 ID, 조건, 원문·담당자 답변 근거, 구현·검사 위치와 상태를 모읍니다. 명확한 요구는 바로 구현하며 데이터에서 발견한 미정 업무 조건만 질문합니다. 추가 답변은 영향받는 부분부터 갱신하고, 입력→검증→처리→저장→조회 흐름을 일찍 연결합니다. 진행 설명과 필수 협업 제출물은 실제 변경 이유·검사 증거·한계에 연결합니다. 별도 Trace 계측은 복잡한 상태·출처 연결을 확인할 때 적용합니다. 이번 변경의 구현 시간 단축 효과는 아직 측정하지 않았습니다.

## 로컬 웹 콘솔

개발 체크아웃에서 Node 24+와 로그인한 Codex CLI로 실행합니다. 콘솔은 기존 전역 설치본을 바꾸지 않습니다.

```sh
npm run console:setup
npm run console
```

[로컬 콘솔](http://127.0.0.1:7777)에서 프로젝트 폴더를 등록하고, 문서 원문이나 선택한 Codex 세션을 가져옵니다. 원문 근거를 바탕으로 AI가 그래프를 연결하며, 선택한 맥락의 일반 Codex 채팅으로 이어갈 수 있습니다. 별도 작업 시작·자동 후속 실행 기능은 없습니다. 근거 원문은 읽기 전용으로 보존하고 해석·관계와 분리합니다.

기본 데이터는 `~/.local/share/proofstill/console/console.sqlite`에 남습니다. `PROOFSTILL_CONSOLE_DATA_DIR`로 보관 폴더, `PROOFSTILL_CONSOLE_PORT`로 포트를 바꿀 수 있습니다. `PROOFSTILL_CONSOLE_PROJECT_ROOT`를 지정하면 해당 프로젝트를 엽니다. Codex 인증은 로컬 app-server가 사용하며 브라우저에 인증 파일이나 API 키를 전달하지 않습니다.

프로젝트를 열면 **구현·검증 현황**에서 요구별 구현 상태, 자동 검사, 독립 리뷰, 남은 일을 따로 봅니다. 요구를 선택해 원문·구현 파일·실행 명령과 출력을 확인하고 구현 기록을 수정할 수 있습니다. 기존 항목은 구현 상태를 추정하지 않고 미기록으로 표시합니다. 앱의 기록·검사 연결은 SQLite에, 하네스 작업의 기록은 프로젝트 `.proofstill/evidence`에 보존합니다.

하네스 작업은 CLI와 앱이 같은 원본을 읽습니다. 예를 들어 `python3 -m proofstill --root /path/to/project implement task-id R1 --status partial --path src/upload.py --remaining "잘못된 파일 처리"`로 기록하고 `python3 -m proofstill --root /path/to/project handoff task-id`로 조회합니다. 구현 선언과 검사/리뷰 통과는 별개입니다. 기존 하네스 소스·기준 버전 검사를 유지하며, 앱 자체 요구의 검사는 요구/구현 기록과 지정 코드·검사 파일의 수정 시각으로 현재성을 확인합니다. 시각이 보존된 외부 변경은 감지하지 못합니다. 앱의 ‘근거 포함 인계 파일 받기’는 현재 상태·원문·구현 파일·재현 명령·출력을 담은 로컬 HTML을 생성합니다. 큰 파일·폴더·출력의 생략과 조회 오류는 인계 파일에서 확인해야 합니다. 다운로드한 시점 이후의 변경은 반영하지 않습니다. 구현 속도 개선 효과는 아직 측정하지 않았습니다.

처음 인계받는 사람은 `python3 -m proofstill brief task-id`로 목표·상태·남은 범위·재현 명령·사람 확인 행동부터 읽습니다. `status`의 `complete`는 자동 검사/독립 리뷰의 기술 판정, `handoff_ready`는 현재 구현 기록·협업 기준·재개 맥락까지 갖춘 상태이며 둘 다 사용자 수용을 뜻하지 않습니다. 이전 구현 기록의 버전을 확인할 수 없으면 다시 확인하도록 표시합니다. 실행·리뷰 근거의 내용도 기록된 해시와 대조하며, 해시가 없는 이전 실행/리뷰는 재실행해야 현재 근거로 인정합니다.

기능 JSON의 선택 항목 `collaboration`은 `human`(사람의 결정 범위), `ai`(위임 범위·제약), `human_checks`(요구별 `requirement`, 사람이 실행할 `action`, 관찰할 `expected`)입니다. 항목을 쓰면 모든 요구의 확인 행동을 검증합니다. 없는 기존 작업은 실행할 수 있지만 인계 준비는 보완 필요로 남고 cleanup은 거부합니다. 협업 기준을 추가할 때는 기존 고정 기준을 바꾸지 말고 새 작업 ID를 사용합니다. `checkpoint task-id --next "원문과 결과 대조" --assumption "배포 제외"`는 다음 행동·가정과 현재 코드/기준을 보존합니다. `decision task-id D1 --question "정책 질문"`은 그 작업의 구현 기록·검사·리뷰를 보류합니다. 실제 답변을 받은 뒤 같은 명령에 `--answer "답변" --source "실제 메시지/문서 위치"`를 붙입니다. 결정 변경은 이전 검사/리뷰 근거를 무효화합니다. checkpoint/보고 저장은 미정 결정을 지우지 않습니다. 등록 밖 변경, 거짓 답변 출처와 하네스 우회까지 방지하지는 않습니다. 사람이 원문과 출력·실제 행동을 확인하고 YES/NO로 수용하며 NO의 차이는 요구에 연결해 수정합니다. 후속 웹 현황은 같은 원본에서 요구별 판단 설명과 사람 확인 행동을 표시해요.


웹 현황에서 요구를 선택하면 잘못 판단할 위험·기준이 필요한 이유·대표 상황과 실제 관찰·사람이 확인할 행동을 먼저 읽을 수 있어요. 명령·로그·원문은 펼쳐 확인해요. ‘기준 적절성’은 실제 부정 검사와 새 독립 기준 검토를 함께 확인하며, 누락·부분·알 수 없는 상태·오래된 근거는 통과로 표시하지 않아요. 이전 지적과 재검토 결과도 구분해요. 조회에 실패하면 이전 자료임을 표시하고 수용 판단을 보류해요. 이번 실제 연결 범위는 Q1-W~Q5-U의 여섯 요구이며, 대조하지 않은 과거 요구는 설명/기준 미확인으로 남아요.

검증 상세는 각 검사의 확인할 내용·필요한 이유·통과 조건을 먼저 보여줍니다. 실제 명령과 출력은 ‘실행 근거 보기’에서 확인합니다. DB 검증은 격리된 메모리 DB와 임시 PostgreSQL 컨테이너를 사용하며, 설치 검증은 별도 임시 프로젝트에서 공개 패키지를 내려받을 수 있습니다. 개인 npm 캐시가 미리 채워져 있다고 가정하지 않습니다.

현재 요구를 통합한 프로젝트에서는 현황의 ‘현재 기능’ 목록과 ‘이전 작업’을 구분합니다. 대표 기능의 ‘요구 조건’에 개별 WC ID를 보존하고, ‘통합 전 논의·작업’에서 원래 노드를 읽습니다. 통합은 원문·실행·대화 기록을 삭제하지 않으며 기존 세션의 컨텍스트도 유지합니다. ‘다음 할 일’은 남은 구현을 우선하고, 구현이 끝났으면 미실행 검사·시나리오·리뷰를 표시합니다. 자동 검사 통과를 실제 화면이나 모델 turn의 확인으로 확대하지 않습니다. 인계 HTML도 현재 목록과 이전 작업을 구분합니다.

콘솔 검사는 `npm run console:test`, `npm --prefix console run typecheck`, `npm run console:build`입니다. 메모리·임시 SQLite와 임의 포트에서 DB/API를 검사하며, 실제 Codex 모델 연결 검사는 테스트용 프로토콜 검사와 구분합니다. 문서 가져오기는 프로젝트 안의 UTF-8 텍스트 파일(최대 2 MiB)을 지원합니다.

직접 수정하려면 다음과 같이 사용합니다.

```sh
git clone https://github.com/jwsong98/proofstill.git
cd proofstill
npm install
node bin/proofstill.mjs setup
```

수정 후 setup을 다시 실행하면 전역 설치본이 갱신됩니다. 설치본은 `CODEX_HOME/proofstill`(기본 `~/.codex/proofstill`)에 보관하며, 스킬은 `~/.agents/skills`에 연결합니다. `setup --codex-home <경로> --skills-dir <경로>`로 위치를 지정할 수 있습니다. 스킬은 자동 감지되며 전역 AGENTS 지침은 새 세션에서 읽습니다. `--help`는 설정을 바꾸지 않습니다.

저장소 검사는 `npm test`, `npm run test:setup`, `npm run test:bootstrap`으로 실행합니다. bootstrap 검사는 먼저 `mkdir -p dist && npm pack --pack-destination dist`로 현재 버전의 tgz를 만든 뒤 실행합니다. Docker가 있는 환경에서는 `npm run test:database`로 Testcontainers까지 확인합니다.

npm으로 설치하는 개발·검증 하네스와 모노레포 스캐폴드입니다. 개인 API 키나 기존 사용자 스킬 폴더 없이 실행합니다. `doctor`는 실행 파일과 버전을 점검하며 Codex 로그인 상태를 보장하지는 않습니다.

```sh
npm install -g https://github.com/jwsong98/proofstill/releases/download/v0.5.0/digitalpresso-proofstill-0.5.0.tgz
proofstill doctor
proofstill scaffold my-project --package-manager npm --install
cd my-project
npm run build
npm run typecheck
npm run dev:backend
# 다른 터미널: npm run dev:app
```

에이전트에게 프로젝트 생성을 요청하면 기획·UX 확인 후 시니어 개발자 인터뷰로 구현 가능성과 아키텍처를 논의합니다. 필요한 사용자 결정을 받은 뒤 개발 스택과 폴더 구조를 확정하며, 제공 템플릿과 맞을 때 위 명령을 실행합니다. CLI 직접 실행은 인터뷰를 자동 수행하거나 차단하지 않습니다.

pnpm이 설치된 환경에서는 `--package-manager pnpm --install`을 사용합니다. 전역 설치 대신 `npm exec --yes --package=https://github.com/jwsong98/proofstill/releases/download/v0.5.0/digitalpresso-proofstill-0.5.0.tgz -- proofstill scaffold my-project --install`도 사용할 수 있습니다. GitHub 공개 Release에서 로그인 없이 내려받습니다. npm registry에는 아직 게시하지 않았습니다. 다운로드한 tgz는 `npm install -g ./digitalpresso-proofstill-0.5.0.tgz`로도 설치할 수 있습니다.

`--apps backend,cli,app`로 생성할 앱을 선택합니다. 기존 디렉터리(빈 디렉터리 포함)를 덮어쓰지 않습니다. 기본 백엔드는 FastAPI + Uvicorn + SQLAlchemy 2 ORM/Alembic, 웹 앱은 React/Vite입니다.

- 백엔드는 `app → usecase → domain`, `infra → domain`으로 나눕니다. domain은 업무 규칙·저장소 계약, usecase는 실행 순서, app은 HTTP, infra는 저장소 구현을 소유합니다. `infra/app.py`만 조립 진입점이며 `app/schemas.py`가 요청·응답 타입을 정의합니다. 서버 실행 후 `/docs`·`/redoc`를 제공합니다.
- `packages/jwdesign`: 실제 컴포넌트·타입·폰트·토큰. 번들러용 React/portal import를 적용합니다.
- `packages/ui`: Radix Slot/CVA 기반 공유 버튼, jwdesign 토큰을 사용하는 shadcn 설정. `npm run ui:add -- card`로 확장합니다.
- `packages/api`: 수용한 계약, 서버 생성 명세, Orval TypeScript 클라이언트.
- `.agents/skills`: jwdesign, design-taste-frontend, proofstill-develop, proofstill-commit, proofstill-verify, proofstill-interview, proofstill-engineer, proofstill-ux, proofstill-api, proofstill-db.

생성 프로젝트는 하네스 배포본을 `.proofstill-runtime`에 포함해 공개 registry나 개인 경로 없이 다시 설치할 수 있습니다. npm/pnpm lockfile은 첫 설치에서 생성되므로 저장소에 함께 커밋하세요.

```sh
npm run openapi:export
npm run api:generate
npm run api:tracker -- env prepare --generate-spec
npm run api:tracker -- spec compare
npm run api:tracker -- flow validate
npm run api:tracker -- flow show
npm run api:tracker -- flow run
npm run api:tracker -- flow show
npm run api:tracker -- env stop
```

flow는 하나이며 별도 session 이름이나 ID를 선택하지 않습니다. 예제는 **할 일 등록 → 완료 처리 → 저장 결과 확인**입니다. `.api-tracker/flow.yaml`의 각 step에 사용자 행동(title), 목적(description), 기대 결과(expected), OpenAPI operationId를 작성합니다. `flow show`는 실행 전 안내와 실행 후 요청·응답·연결 출처를 함께 보여줍니다.

- `flow run`: 아직 실행하지 않은 단계를 순서대로 실행합니다. 완료 단계는 다시 호출하지 않습니다.
- `flow step create_task`: 다음 단계 하나만 실행합니다. 다른 단계로 건너뛸 수 없습니다.
- `flow retry`: 실패하거나 중단된 다음 단계를 명시적으로 재시도합니다. 서버에 이미 쓰기가 반영됐는지 먼저 확인하세요. 이전 시도는 같은 단계에 보존됩니다.
- `flow reset`: `.api-tracker/flow-record.json`만 제거합니다. 서버 데이터를 되돌리지 않습니다. 정의·명세·서버가 변경됐으면 기존 기록을 확인한 뒤 초기화합니다.

앞 단계의 실제 응답은 `{"from":"create_task","pointer":"/id"}`로 후속 step의 input.path/query/body에 연결합니다. 기대 응답은 expect.status와 expect.body의 JSON Pointer별 값으로 검사합니다. 실패하면 후속 단계는 실행하지 않습니다. 동시에 실행하면 flow.lock으로 중복 호출을 막습니다. 강제 종료로 잠금이 남으면 실행 프로세스 종료와 서버 처리 결과를 확인한 뒤 잠금 파일을 제거하고 명시적으로 재시도합니다.

기본 할 일 데이터는 서버 메모리에 있으며 재시작 시 사라집니다. 다른 서버는 flow의 baseUrl 또는 API_TRACKER_BASE_URL로 지정하고 spec 경로를 설정합니다. 인증은 headers의 `{"Authorization":{"env":"APP_AUTHORIZATION"}}`처럼 환경변수로 연결하며 헤더 값은 기록하지 않습니다. 이 버전은 순차 HTTP JSON 흐름을 지원하며 조건 분기·반복·병렬 실행은 포함하지 않습니다.

`proofstill.config.json`의 `openapi`에는 `command` argv, `file`, `url` 중 하나를 지정합니다. JSON/YAML 입력을 검증하여 JSON으로 내보내며 exporter 명령은 stdout에 명세만 출력해야 합니다. 각 API operation에는 고유한 `operationId`가 필요합니다. 외부 `$ref`는 먼저 하나의 문서로 묶어야 합니다. export는 계약을 자동으로 덮어쓰지 않습니다.

기존 저장소에서는 tgz를 devDependency로 설치한 후 `npx proofstill openapi export --url http://127.0.0.1:8000/openapi.json --output packages/api/openapi.generated.json` 또는 `--file spec.yaml`로 사용합니다. 명시적으로 계약을 가져올 때만 `--output packages/api/openapi.contract.json`을 지정합니다. 기존 저장소의 flow는 생성 예제의 `.api-tracker/flow.yaml`을 가져와 spec·baseUrl·steps를 해당 API에 맞게 연결합니다. 다른 백엔드를 연결할 때는 exporter와 lifecycle adapter를 해당 서버에 맞게 구현해야 합니다.

기존 Python 하네스는 `proofstill harness --help` 또는 생성 저장소의 `npm run proofstill -- --help`로 사용합니다. Python 실행 파일을 바꾸려면 `PROOFSTILL_PYTHON`을 지정합니다. 백엔드와 OpenAPI exporter는 `backend:setup`으로 만든 전용 Python을 함께 사용합니다. 실행 파일을 바꾸려면 `PROOFSTILL_BACKEND_PYTHON`을 지정합니다. Codex 설치·로그인과 Python/Node 자체 설치는 자동 수행하지 않습니다.

서버 lifecycle과 명세 비교는 기존 API Tracker 0.2.0의 배포 파일을 사용합니다(원본 커밋 `d7453f896263e1ed48f8e425613fed00edb4dec0`). jwdesign과 design-taste-frontend는 함께 제공된 원본 스킬·자산을 포함하며 폰트의 OFL 고지를 보존합니다. flow 호출·기록은 이 패키지의 단순한 순차 실행기를 사용합니다. 전체 API 스키마 적합성이나 실제 제품 UI 클릭까지 보증하지 않습니다.

현재 검증 대상은 macOS/POSIX, Node 24와 Python 3.14 환경의 npm/pnpm 설치·빌드·타입 검사·로컬 HTTP 흐름입니다. Windows와 제품 UI 클릭은 검증 범위 밖입니다. 시험 문제·파일·결과물을 외부로 전송하지 않으며 로컬 runtime/flow 기록은 소스 관리에서 제외합니다.

설정 형식의 근거: [shadcn monorepo](https://ui.shadcn.com/docs/monorepo), [Orval configuration](https://orval.dev/docs/reference/configuration/), [npm package files](https://docs.npmjs.com/cli/configuring-npm/package-json/).

## DB 명령과 검증 단계

`npm run backend:setup`으로 Python 의존성을 전용 `.venv`에 설치합니다. `scaffold --install`은 이 과정도 실행합니다. 아래 명령은 npm/pnpm 모두 사용할 수 있습니다.

| 명령 | 동작 |
|---|---|
| `backend:setup` | Python 가상환경과 고정 의존성 설치 |
| `db:check` | SQLite `:memory:`에서 실제 migration·seed 검사 |
| `test:unit` | 메모리 DB의 도메인·SQL 제약·migration·seed 검사 |
| `test:integration` | seed를 적용한 메모리 DB의 실제 HTTP 검사 |
| `test:flow` | CLI 사용자 흐름을 전용 메모리 DB·임의 포트·임시 기록으로 검사 |
| `test:architecture` | import 방향·순환 참조 검사 |
| `test:domain` / `test:usecase` | 외부 패키지 없는 순수 계층 검사, 단일 테스트 선택 지원 |
| `test:fast` | architecture + domain + usecase + unit + integration + flow, Docker 불필요 |
| `test:e2e` | PostgreSQL Testcontainers + 실제 HTTP flow + DB 값·지속성·정리 검사 |
| `db:revision -- --message "change"` | migration 생성, `--autogenerate` 지원 |
| `db:migrate` | migration 적용, `--revision`으로 목표 지정 |
| `db:status` | 현재·최신·미적용 revision 확인 |
| `db:rollback` | 한 단계 되돌리기, `--revision` 지정 가능 |
| `db:seed` | 고정 seed의 누락 ID 추가, 기존 수정값 보존 |
| `db:reset -- --yes` | 대상 DB의 전체 downgrade → upgrade → seed |

관리용 db:revision/migrate/status/rollback/seed/reset은 `DATABASE_URL`을 명시해야 합니다. 예를 들어 `export DATABASE_URL='sqlite+pysqlite:///./dev.sqlite'`로 별도 개발 DB를 지정합니다(상대 경로는 apps/backend 기준). PostgreSQL은 `postgresql+psycopg://…` URL을 사용합니다. `db:reset -- --yes`는 대상 DB 데이터를 제거합니다.

기본 서버는 매번 SQLite :memory:에 같은 Alembic migration과 `seed/tasks.json`을 적용합니다. 외부 DATABASE_URL을 지정한 서버는 최신 스키마인지 확인하며 자동으로 migration/seed를 수행하지 않습니다. 먼저 db:migrate와 db:seed를 실행합니다. test:unit/integration/flow/fast와 db:check는 외부 DB 설정을 무시합니다.

test:e2e는 메모리 DB의 unit/integration/flow를 먼저 실행하고 통과한 경우에만 컨테이너 단계로 진행합니다. E2E는 실행 중인 Docker가 필요합니다. Testcontainers가 임시 PostgreSQL을 만들고 migration·seed, 실제 API 사용자 흐름, SQL 행 일치와 서버 재시작 지속성까지 확인한 뒤 컨테이너를 제거합니다. Docker 오류는 실패이며 메모리 DB로 대체하거나 건너뛰지 않습니다. 성공 결과는 `.proofstill/test-results/e2e.json`에 남고, 다음 E2E 시작 시 오래된 결과를 제거합니다. 브라우저 클릭은 이 API E2E의 범위에 포함하지 않습니다.

구성 근거: [Alembic 연결 공유](https://alembic.sqlalchemy.org/en/latest/cookbook.html#sharing-a-connection-across-one-or-more-programmatic-migration-commands), [Testcontainers PostgreSQL](https://testcontainers-python.readthedocs.io/en/latest/).

## 개발과 최종 리뷰

`init <기능 정의 JSON>` → 구현 및 `test <ID>` → `review <ID>` → `report <ID>` 순서로 진행합니다. test는 기본 Green, review는 기준 적절성과 구현을 함께 보는 최종 독립 리뷰입니다. 사전 criteria 리뷰와 Red 검사는 선택 사항입니다. 테스트 파일을 고치면 같은 작업에서 다시 검사하며 이전 결과는 현재 버전의 근거가 되지 않습니다.

리뷰는 원본 프로젝트를 읽고 대상 경로·해시만 보존합니다. 코드 복사본을 만들지 않으며, 리뷰 중 담당 소스나 테스트가 바뀌면 판정을 무효화합니다. 같은 작업 ID의 명령은 동시에 쓰지 못하게 잠그고, 서로 다른 작업은 담당 sources와 공유 의존성 범위로 검사합니다.

개발 중 `npm run test:integration` 또는 `npm run test:flow`, 통합 시 `npm run test:fast`를 사용합니다. flow 검사는 할 일 등록 → 완료 처리 → 재조회 CLI 흐름을 실행마다 별도 메모리 DB·임의 포트·임시 기록으로 검사합니다. 두 실행을 동시에 돌려 데이터가 섞이지 않는지도 확인합니다. Node/Python 의존성 설치는 필요하지만 Docker와 외부 DB는 필요하지 않습니다. 브라우저 클릭 검사는 포함하지 않습니다.

병렬 구현은 앱·기능별 폴더로 나눕니다. UI 기능은 `apps/app/src/features/<기능>`에 두고, 백엔드는 기능별 domain/usecase/app/infra 파일 및 대응 테스트를 담당합니다. 새로운 동작은 실패 테스트(Red) → 구현(Green) → 정리 순서로 진행합니다. API 계약·생성 코드·공유 UI·migration·package/lockfile·진입점 연결은 한 담당자가 통합합니다. Git worktree는 이러한 경계와 실행별 자원 분리로 해결되지 않을 때만 고려합니다.

ORM 필드 추가 → `db:revision -- --message "change" --autogenerate` → migration 검토·적용 → 라우트 추가의 실행 예제는 [생성 프로젝트 안내](templates/monorepo/README.md#모델에서-api까지-확장하기)에 있습니다. OpenAPI는 수동 명세 대신 실제 FastAPI 앱에서 생성하며 export는 DB에 접속하지 않습니다. 구성 근거: [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [SQLAlchemy declarative models](https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html).

## JWT 인증 기반

백엔드 선택 시 `npm run backend:setup` 후 `npm run auth:setup`을 실행합니다.
루트 `.env.example`을 `.env`로 복사해 설정할 수 있으며, auth:setup은 비어 있는
`JWT_SECRET_KEY`에 무작위 키를 생성하고 기존 키·다른 설정은 보존합니다. 생성한
`.env`는 커밋하지 않습니다. `JWT_TTL_SECONDS` 기본값은 3600초입니다.
루트 `.env`는 npm/pnpm 백엔드 명령에서 읽으며, 기존 환경 변수가 우선합니다.

로그인 처리에서 자격 확인을 마친 뒤 토큰을 발급합니다. 사용자 데이터 구조는
고정하지 않으며 `data` 객체에 보존합니다. 공통 `iat`·`exp`는 발급기가 관리하고
검증은 HS256 서명과 만료를 필수 확인합니다.

```python
from fastapi import Depends
from infra.auth import TokenService, require_token

# 로그인 서비스에서 자격 확인을 마친 후 호출합니다.
token = TokenService.from_env().issue({'user_id': 'your-user-id'})
data = TokenService.from_env().verify(token)

# create_app 안에서 보호할 라우트에 적용합니다.
@app.get('/account')
def account(data=Depends(require_token)):
    return data
```

요청은 `Authorization: Bearer <token>`을 사용합니다. 잘못되거나 만료된 토큰은
401, 키 설정 누락은 503입니다. 이 기반에는 계정 저장·비밀번호 검사·로그인 API·
refresh/revoke 정책이 포함되지 않습니다. 기존 예제 API는 공개 상태이며 필요한
라우트에 의존성을 붙여 보호합니다. JWT 데이터는 암호화되지 않으므로 비밀번호나
비밀 키를 payload에 넣지 않습니다.

## CORS와 프런트엔드 연결 기본값

스캐폴드는 루트 `.env.example`에 `CORS_ORIGINS`, `CORS_ALLOW_CREDENTIALS`,
`VITE_API_BASE_URL`, `BACKEND_URL`을 제공합니다. 로컬 개발은 앱 5173 → `/api/*`
프록시 → FastAPI 8000으로 연결됩니다. 생성 API 클라이언트도 같은 base URL을
사용합니다. 교차 출처 Bearer·JSON 요청의 preflight와 인증 오류 헤더를 처리합니다.
배포 주소·쿠키 사용을 바꾸는 방법과 코드 예시는 생성 프로젝트의 README에 있습니다.
