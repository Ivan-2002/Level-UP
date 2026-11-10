import request from "supertest";
import { describe, expect, it } from "vitest";
import { app, signUpUser } from "../../test/helpers.js";

describe("GET /me", () => {
  it("returns 401 without a session", async () => {
    const res = await request(app).get("/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns the signed-up user, using the cookie from the sign-up response", async () => {
    const user = await signUpUser({ email: "ivan@example.com" });

    const res = await request(app).get("/me").set("Cookie", user.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.userId, email: "ivan@example.com" });
  });

  it("returns 401 for a made-up session cookie", async () => {
    const res = await request(app).get("/me").set("Cookie", "better-auth.session_token=forged");

    expect(res.status).toBe(401);
  });
});
