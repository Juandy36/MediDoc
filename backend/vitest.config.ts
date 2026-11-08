import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    fileParallelism: false, // comparten la BD de dev
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
