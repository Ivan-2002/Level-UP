import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { EXERCISE_CATALOG } from "../modules/exercises/exercise-catalog.js";
import { upsertCatalog } from "../modules/exercises/exercises.repository.js";

// The real Express app, without app.listen(). Supertest feeds requests straight into it:
// no port, no running server, and nothing to clean up between tests.
export const app = createApp();

export type TestUser = {
  userId: string;
  email: string;
  password: string;
  /** Ready for `.set("Cookie", user.cookie)` on any protected route. */
  cookie: string;
};

let counter = 0;

/**
 * Signs up a fresh user through the REAL Better Auth endpoint (the same one the app calls)
 * and returns their session cookie. Going through the endpoint, not inserting rows,
 * means the tests also prove sign-up and sessions work.
 */
export async function signUpUser(overrides: { email?: string; password?: string } = {}): Promise<TestUser> {
  counter += 1;
  const email = overrides.email ?? `player${counter}@example.com`;
  const password = overrides.password ?? "correct-horse-battery";

  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({ email, password, name: "Test Player" });
  if (res.status !== 200) {
    throw new Error(`Test sign-up failed (${res.status}): ${res.text}`);
  }

  return { userId: res.body.user.id, email, password, cookie: sessionCookie(res.get("Set-Cookie")) };
}

let playerCount = 0;

/**
 * A signed-up user WITH a character (profile), like every real player who logs workouts.
 * Bodyweight is optional, as on the "Create your character" screen.
 */
export async function signUpPlayer(options: { bodyweightKg?: number; weeklyTarget?: number } = {}): Promise<TestUser> {
  const user = await signUpUser();
  playerCount += 1;
  const res = await request(app)
    .post("/profile")
    .set("Cookie", user.cookie)
    .send({ username: `player_${playerCount}`, weeklyTarget: options.weeklyTarget ?? 3, bodyweightKg: options.bodyweightKg });
  if (res.status !== 201) throw new Error(`Test profile failed (${res.status}): ${res.text}`);
  return user;
}

/**
 * Set-Cookie headers carry attributes meant for the client ("Path=/; HttpOnly; ...").
 * A Cookie request header only sends the name=value pairs, so keep just those.
 */
function sessionCookie(setCookie: string[] | undefined): string {
  if (!setCookie?.length) throw new Error("Sign-up response had no Set-Cookie header");
  return setCookie.map((header) => header.split(";")[0]).join("; ");
}

/**
 * Loads the REAL exercise catalog (the same upsert `pnpm db:seed` uses) and returns
 * slug -> id. Tables are wiped before every test, so call this in a beforeEach.
 */
export async function seedExercises(): Promise<Record<string, string>> {
  await upsertCatalog(EXERCISE_CATALOG);
  const rows = await prisma.exercise.findMany({ select: { id: true, slug: true } });
  return Object.fromEntries(rows.map((r) => [r.slug!, r.id]));
}
