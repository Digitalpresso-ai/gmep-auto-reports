import path from "node:path";
import { defineConfig } from "vitest/config";

const root = path.resolve(import.meta.dirname, "../..");

// 실제 Anthropic 호출을 하는 품질 평가(*.eval.ts)와 하네스의 순수 함수 검사(*.test.ts).
// `npm test`에는 넣지 않는다. eval은 사용자가 요청할 때만 파일을 지정해 돌린다.
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "node_modules/server-only/empty.js"),
    },
  },
  test: { include: ["scripts/eval/*.eval.ts", "scripts/eval/*.test.ts"], testTimeout: 1_800_000, hookTimeout: 600_000, fileParallelism: false },
});
