import request from "supertest";
import { createApp } from "../app.js";

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

/**
 * Set-Cookie headers carry attributes meant for the client ("Path=/; HttpOnly; ...").
 * A Cookie request header only sends the name=value pairs, so keep just those.
 */
function sessionCookie(setCookie: string[] | undefined): string {
  if (!setCookie?.length) throw new Error("Sign-up response had no Set-Cookie header");
  return setCookie.map((header) => header.split(";")[0]).join("; ");
}
