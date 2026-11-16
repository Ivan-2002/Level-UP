import { afterAll, beforeEach } from "vitest";
import { env } from "../config/env.js";
import { setNow } from "../lib/clock.js";
import { prisma } from "../lib/prisma.js";
import { assertIsTestDatabase } from "./test-database.js";

// Runs inside every test file (vitest "setupFiles").

// Every test starts from an empty database, so tests can't depend on each other's leftovers
// and can run in any order.
beforeEach(async () => {
  setNow(null); // the real time, unless a test sets the clock

  // One last check right before the only destructive line in the test suite.
  assertIsTestDatabase(env.DATABASE_URL);

  // Ask Postgres for the table list instead of hard-coding it, so tables added in later
  // milestones are wiped too. Prisma's own migration history is kept.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;

  // TRUNCATE empties tables in one statement (much faster than DELETE).
  // CASCADE follows foreign keys, e.g. profile -> user.
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
});

// Close the connection pool, or the test process waits on open connections.
afterAll(async () => {
  await prisma.$disconnect();
});
