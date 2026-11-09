import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not read .env files by itself. Load the repo-root .env
// (same file the API uses) when it exists; in production the host sets real variables.
const rootEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
