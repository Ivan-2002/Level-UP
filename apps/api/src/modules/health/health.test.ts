import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../test/helpers.js";

describe("GET /health", () => {
  it("reports the API and the database as up", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "up" });
  });
});
