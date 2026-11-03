import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Next 밖에서는 react-server 조건이 없어 server-only가 throw하므로 빈 모듈로 바꾼다
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120_000, hookTimeout: 120_000 },
});
