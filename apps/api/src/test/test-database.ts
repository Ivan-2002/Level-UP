import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Decides WHICH database the tests use, and refuses anything that isn't a test database.
//
// - TEST_DATABASE_URL set (CI does this): use it.
// - Otherwise: take DATABASE_URL from .env and rename the database to "<name>_test",
//   so locally `levelup` becomes `levelup_test` on the same Docker Postgres.
//
// Either way the database name MUST end in "_test". Tests truncate every table before
// each test; pointed at the dev database, that would wipe your real data.

export function resolveTestDatabaseUrl(): string {
  loadRootEnvFile();

  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const devUrl = process.env.DATABASE_URL;
    if (!devUrl) {
      throw new Error("Set DATABASE_URL (in .env) or TEST_DATABASE_URL to run the API tests.");
    }
    const parsed = new URL(devUrl);
    parsed.pathname = `/${databaseName(devUrl)}_test`;
    url = parsed.toString();
  }

  assertIsTestDatabase(url);
  return url;
}

export function assertIsTestDatabase(url: string): void {
  const name = databaseName(url);
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against the database "${name}": a test database name must end in "_test".`,
    );
  }
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

// Same .env file the API uses. Variables that are already set (e.g. by CI) are NOT
// overwritten: process.loadEnvFile only fills in the missing ones.
function loadRootEnvFile() {
  const rootEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}
