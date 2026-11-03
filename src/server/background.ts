import "server-only";
import { after } from "next/server";

// 응답을 보낸 뒤 같은 함수 실행 시간 안에서 이어서 할 일. 테스트는 이 모듈을 바꿔 실행 시점을 직접 정한다.
export function afterResponse(fn: () => Promise<void>) {
  after(fn);
}
