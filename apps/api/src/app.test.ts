import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./test/helpers.js";

// Pins the URL layout decided in docs/ARCHITECTURE.md (API versioning): our routes live
// under /v1 only; /health and /api/auth stay unversioned.
describe("API versioning", () => {
  it("serves our routes under /v1 (401 = the route exists and wants a session)", async () => {
    expect((await request(app).get("/v1/me")).status).toBe(401);
    expect((await request(app).get("/v1/workouts")).status).toBe(401);
  });

  it("no longer serves them unversioned", async () => {
    const res = await request(app).get("/workouts");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "NotFound" });
  });

  it("keeps /health and Better Auth unversioned", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/v1/health")).status).toBe(404);
    expect((await request(app).get("/api/auth/get-session")).status).toBe(200);
  });
});
