---
name: proofstill-db
description: Manage migrations and seed data through repository commands; verify with SQLite memory databases before PostgreSQL Testcontainers E2E.
---

# DB 준비와 검증

저장소 루트에서 실행한다. 모든 명령은 `npm run`과 `pnpm run`을 지원한다.

- `backend:setup`: backend/.venv를 만들고 requirements.txt의 의존성을 설치한다. scaffold --install에도 포함된다.
- `db:check`: 외부 설정을 무시하고 SQLite `:memory:`에 실제 migration과 seed를 적용해 확인한다.
- `test:unit`: 새 메모리 DB에서 도메인·SQL 제약·migration·seed를 검사한다.
- `test:integration`: seed가 있는 메모리 DB로 실제 HTTP 서버를 검증한다.
- `test:flow`: 실제 CLI 사용자 흐름을 전용 메모리 DB·임의 포트·임시 기록으로 실행한다. 동시에 실행해도 공유 개발 서버와 flow 기록을 사용하지 않는다.
- `test:fast`: test:unit, test:integration, test:flow를 순서대로 실행한다. Docker가 필요 없다.
- `test:e2e`: 메모리 DB의 unit/integration/flow을 먼저 통과해야 Testcontainers가 임시 PostgreSQL을 시작한다. 같은 migration·seed를 적용하고 실제 HTTP flow, DB 값, 서버 재시작 지속성, rollback/upgrade, 컨테이너 정리를 검증한다. Docker 오류는 실패이며 skip이나 메모리 대체를 하지 않는다.

관리용 명령은 대상 `DATABASE_URL`을 반드시 지정한다. 예: `export DATABASE_URL='sqlite+pysqlite:///./dev.sqlite'`. 상대 SQLite 경로의 기준은 apps/backend다. 실제 PostgreSQL은 postgresql+psycopg URL을 사용한다. 암호를 소스에 저장하지 않는다.

```sh
npm run db:revision -- --message "add task field"
npm run db:migrate
npm run db:status
npm run db:seed
npm run db:rollback
npm run db:reset -- --yes
```

- db:revision은 새 revision을 만든다. 필요하면 --autogenerate를 추가하고 결과를 검토한다. infra/database.py의 metadata와 migration을 함께 유지한다.
- db:migrate는 head까지 적용한다. --revision으로 목표 버전을 지정할 수 있다. db:rollback 기본값은 한 단계(-1)다.
- db:seed는 seed/tasks.json에 있는 누락 ID만 추가한다. 기존 제목·완료 상태를 덮어쓰지 않는다.
- db:reset은 --yes가 있어야 전체 downgrade→upgrade→seed를 수행한다. 대상 DB의 데이터가 제거된다. 도중 실패는 성공으로 보고하지 않는다.

기본 dev:backend는 SQLite :memory:에 migration과 seed를 적용한다. DATABASE_URL을 지정한 서버는 스키마가 최신인지 확인하며 자동 migration/seed를 하지 않는다. 먼저 db:migrate와 db:seed를 실행한다. unit/integration/flow/fast와 db:check는 외부 DATABASE_URL에 의존하지 않는다.

E2E에는 실행 중인 Docker 엔진과 공개 이미지 다운로드가 필요하다. DOCKER_HOST가 없으면 현재 Docker context를 사용한다. .proofstill/test-results/e2e.json은 성공한 실제 컨테이너 검증 결과이며, E2E 시작 시 이전 파일을 제거한다. E2E 범위는 HTTP API→DB이며 브라우저 클릭 검증은 포함하지 않는다.
