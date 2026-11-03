---
name: proofstill-api
description: Export OpenAPI, generate Orval clients, and verify an explained multi-step user journey with one local flow.
---

# 사용자 흐름과 API 검증

저장소 루트에서 실행한다. `npm run` 대신 `pnpm run`을 사용할 수 있다.

1. `proofstill.config.json`의 openapi.command argv, file, url 중 하나를 백엔드 명세에 연결한다. `npm run openapi:export`, `npm run api:generate`를 실행한다. 수용한 계약과 생성 명세를 분리하고 생성 코드를 직접 수정하지 않는다.
2. `npm run api:tracker -- app doctor`로 adapter를 확인하고 `npm run api:tracker -- env prepare --generate-spec`, `npm run api:tracker -- spec compare`를 실행한다. 다른 백엔드는 start/stop/reset/health/export adapter를 해당 서버에 맞게 구현한다.
3. `.api-tracker/flow.yaml`에 하나의 사용자 목표와 순서 있는 steps를 작성한다. 각 단계는 id, title(사용자 행동), description(목적과 맥락), expected(사용자가 기대하는 결과), operationId, expect.status를 갖는다. 예제는 할 일 등록 → 완료 처리 → 결과 확인이다. 설명은 실제 요구에 맞게 바꾸고 API 호출 목록으로 대체하지 않는다.
4. input.path/query/body 안에 `{"from":"create_task","pointer":"/id"}`를 넣으면 앞선 성공 단계의 실제 응답 body에서 값을 가져온다. 정적 ID를 복사해 출처 연결을 대신하지 않는다. 기대 body 값은 expect.body의 JSON Pointer로 검사한다. operationId와 path/query/body는 OpenAPI 계약을 따른다. 인증 헤더가 필요하면 flow의 headers에 `{"Authorization":{"env":"APP_AUTHORIZATION"}}`처럼 환경변수 이름만 설정한다. 헤더 값은 기록하지 않는다.
5. `npm run api:tracker -- flow validate` 후 `npm run api:tracker -- flow show`로 목표·단계·기대 결과를 읽는다. `npm run api:tracker -- flow run`은 남은 단계를 순서대로 실행한다. 한 단계만 실행하려면 `npm run api:tracker -- flow step create_task`를 사용한다. 별도의 실행 이름이나 ID를 고르지 않는다.
6. `npm run api:tracker -- flow show`와 `.api-tracker/flow-record.json`에서 단계 설명·요청·응답·출처·성공/실패를 함께 확인한다. 완료한 단계는 재호출하지 않는다. 실패하면 뒤 단계를 중단한다. 쓰기 요청이 서버에서 처리됐을 가능성을 확인한 후에만 `flow retry`로 실패한 다음 단계를 명시적으로 재시도한다. 재시도 이력은 같은 단계에 남는다.
7. 정의·명세·서버 주소를 바꾸거나 처음부터 실행하려면 `npm run api:tracker -- flow reset`을 사용한다. 기록만 지우며 서버 데이터는 되돌리지 않는다. 강제 종료 후 flow.lock이 남으면 실행 프로세스가 종료됐고 서버 변경 결과를 확인한 뒤 잠금 파일을 제거한다. running 상태는 자동 재실행하지 않는다.
8. 작업을 마치면 `npm run api:tracker -- env stop`으로 이 도구가 시작한 서버를 종료한다. runtime과 flow 기록은 로컬에만 남기고 소스 관리에서 제외한다. 시험 자료를 외부 서비스로 전송하지 않는다.

이 도구는 순차 HTTP JSON API 흐름을 확인한다. 조건 분기·반복·병렬 실행은 지원하지 않는다. 실제 제품 UI 클릭과 전체 응답 스키마 적합성은 별도 검증이다. 기본 예제의 할 일 데이터는 서버 메모리에 있어 서버 재시작 시 사라진다.
