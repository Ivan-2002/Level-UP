import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseName, resolveTestDatabaseUrl } from "./test-database.js";

const apiDir = fileURLToPath(new URL("../..", import.meta.url));

// Vitest runs this once, before any test file. It makes the test database exist and
// match the latest schema, so `pnpm test` works on a fresh machine with only Docker running.
export default async function globalSetup() {
  const url = resolveTestDatabaseUrl();
  await createDatabaseIfMissing(url);
  applyMigrations(url);
}

// Connect to the server's built-in "postgres" database (a database can't create itself).
async function createDatabaseIfMissing(url: string) {
  const name = databaseName(url);
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unexpected test database name "${name}"`);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    // CREATE DATABASE can't take a $1 parameter; the name was checked by the regex above.
    if (rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

// `migrate deploy` (not `migrate dev`): it only applies migrations that are already
// committed, never creates new ones and never prompts. Already up to date = a quick no-op.
function applyMigrations(url: string) {
  try {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
  } catch (error) {
    const output = (error as { stdout?: Buffer; stderr?: Buffer });
    throw new Error(
      `prisma migrate deploy failed for the test database:\n${output.stdout ?? ""}${output.stderr ?? ""}`,
    );
  }
}
