import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "./src/test/test-database.js";

// API integration tests: real Express app (via createApp, no server listening) against a
// real Postgres test database. See src/test/ for the setup files referenced below.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],

    // Set BEFORE any app code loads, so src/config/env.ts sees the test database.
    // (Its .env loading never overwrites variables that are already set.)
    env: {
      NODE_ENV: "test",
      DATABASE_URL: resolveTestDatabaseUrl(),
    },

    // Runs ONCE before all test files: create the test database, apply migrations.
    globalSetup: ["./src/test/global-setup.ts"],
    // Runs in EVERY test file: wipe data before each test, disconnect at the end.
    setupFiles: ["./src/test/setup.ts"],

    // All files share ONE database. Run them one after another, otherwise one file's
    // truncate would delete rows another file is in the middle of using.
    fileParallelism: false,
  },
});
