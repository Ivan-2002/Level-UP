import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { BODY_PARTS, exerciseListSchema } from "@levelup/shared";
import { app, seedExercises, signUpUser } from "../../test/helpers.js";
import { EXERCISE_CATALOG } from "./exercise-catalog.js";

describe("GET /exercises", () => {
  beforeEach(async () => {
    await seedExercises();
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/exercises");

    expect(res.status).toBe(401);
  });

  it("returns the whole built-in library in the shared response shape", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/exercises").set("Cookie", user.cookie);

    expect(res.status).toBe(200);
    const { items } = exerciseListSchema.parse(res.body); // throws if the contract drifted
    expect(items).toHaveLength(EXERCISE_CATALOG.length);
    expect(new Set(items.map((e) => e.bodyPart))).toEqual(new Set(BODY_PARTS));
    expect(items).toContainEqual(expect.objectContaining({ name: "Push-up", bodyPart: "chest", equipment: "bodyweight" }));
  });

  it("marks plank as timed (seconds) and everything else as counted reps", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/exercises").set("Cookie", user.cookie);

    const timed = res.body.items.filter((e: { repsUnit: string }) => e.repsUnit === "seconds");
    expect(timed.map((e: { name: string }) => e.name)).toEqual(["Plank"]);
  });

  it("keeps XP tuning values on the server", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/exercises").set("Cookie", user.cookie);

    for (const exercise of res.body.items) {
      expect(exercise).not.toHaveProperty("loadFactor");
      expect(exercise).not.toHaveProperty("bodyweightRatio");
    }
  });
});

describe("exercise catalog", () => {
  it("has a unique slug for every exercise", () => {
    const slugs = EXERCISE_CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only gives a bodyweight share to exercises that move your body", () => {
    for (const e of EXERCISE_CATALOG) {
      expect(e.bodyweightRatio, e.slug).toBeGreaterThanOrEqual(0);
      expect(e.bodyweightRatio, e.slug).toBeLessThanOrEqual(1);
      if (e.equipment === "bodyweight") expect(e.bodyweightRatio, e.slug).toBeGreaterThan(0);
    }
  });
});
