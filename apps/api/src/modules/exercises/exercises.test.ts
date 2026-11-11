import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { BODY_PARTS, exerciseListSchema, exerciseSchema } from "@levelup/shared";
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

  it("includes the XP tuning values and rest suggestion the app needs for live display", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/exercises").set("Cookie", user.cookie);

    expect(res.body.items).toContainEqual(
      expect.objectContaining({
        name: "Pull-up",
        loadFactor: 1.25,
        bodyweightRatio: 1,
        mechanic: "compound",
        suggestedRestSec: 150,
        isCustom: false,
        restPreferenceSec: null,
      }),
    );
  });

  it("searches name OR muscle group, ignoring case, every word must match", async () => {
    const user = await signUpUser();
    const search = async (q: string) =>
      (await request(app).get(`/exercises?search=${encodeURIComponent(q)}`).set("Cookie", user.cookie)).body.items.map(
        (e: { name: string }) => e.name,
      );

    expect(await search("BENCH")).toEqual(["Bench Press"]);
    expect(await search("lats")).toEqual(expect.arrayContaining(["Pull-up", "Lat Pulldown", "One-arm Dumbbell Row"]));
    // Sorted by body part in enum order (chest before shoulders), then name.
    expect(await search("dumbbell press")).toEqual(["Incline Dumbbell Press", "Dumbbell Shoulder Press"]);
  });

  it("filters by body part, combined with search", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/exercises?bodyPart=core&search=plank").set("Cookie", user.cookie);

    expect(res.body.items.map((e: { name: string }) => e.name)).toEqual(["Plank"]);
  });

  it("rejects an unknown body part with 400", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/exercises?bodyPart=wings").set("Cookie", user.cookie);

    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("bodyPart");
  });
});

describe("POST /exercises (custom exercise)", () => {
  beforeEach(async () => {
    await seedExercises();
  });

  const custom = { name: "Landmine Press", muscleGroup: "Front delts", bodyPart: "shoulders", equipment: "barbell", mechanic: "compound" };

  it("creates it with conservative server-chosen XP tuning", async () => {
    const user = await signUpUser();

    const res = await request(app).post("/exercises").set("Cookie", user.cookie).send(custom);

    expect(res.status).toBe(201);
    expect(exerciseSchema.parse(res.body)).toMatchObject({
      ...custom,
      repsUnit: "reps",
      isCustom: true,
      loadFactor: 1,
      bodyweightRatio: 0,
      suggestedRestSec: 150,
    });
  });

  it("ignores tuning values sent by the client", async () => {
    const user = await signUpUser();

    const res = await request(app)
      .post("/exercises")
      .set("Cookie", user.cookie)
      .send({ ...custom, loadFactor: 50, bodyweightRatio: 1 });

    expect(res.body).toMatchObject({ loadFactor: 1, bodyweightRatio: 0 });
  });

  it("gives bodyweight custom exercises a share of bodyweight so they still earn XP", async () => {
    const user = await signUpUser();

    const res = await request(app)
      .post("/exercises")
      .set("Cookie", user.cookie)
      .send({ name: "Archer Push-up", muscleGroup: "Chest", bodyPart: "chest", equipment: "bodyweight", mechanic: "compound" });

    expect(res.body.bodyweightRatio).toBe(0.6);
  });

  it("shows a custom exercise only to its owner", async () => {
    const owner = await signUpUser();
    const someoneElse = await signUpUser();
    await request(app).post("/exercises").set("Cookie", owner.cookie).send(custom);

    const names = async (user: typeof owner) =>
      (await request(app).get("/exercises?search=landmine").set("Cookie", user.cookie)).body.items.map((e: { name: string }) => e.name);

    expect(await names(owner)).toEqual(["Landmine Press"]);
    expect(await names(someoneElse)).toEqual([]);
  });

  it("validates the body and needs a session", async () => {
    const user = await signUpUser();

    const invalid = await request(app).post("/exercises").set("Cookie", user.cookie).send({ ...custom, name: "X", equipment: "rock" });
    const anonymous = await request(app).post("/exercises").send(custom);

    expect(invalid.status).toBe(400);
    expect(invalid.body.issues.map((i: { path: string }) => i.path)).toEqual(["name", "equipment"]);
    expect(anonymous.status).toBe(401);
  });
});

describe("exercise catalog", () => {
  it("has a unique slug for every exercise", () => {
    const slugs = EXERCISE_CATALOG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("suggests rest in 15 s steps, inside each mechanic's range", () => {
    const ranges = { compound: [120, 180], isolation: [45, 90] } as const;
    for (const e of EXERCISE_CATALOG) {
      const [min, max] = ranges[e.mechanic];
      expect(e.suggestedRestSec % 15, e.slug).toBe(0);
      // Push-ups are a compound movement but bodyweight: allowed the shorter 1:30.
      expect(e.suggestedRestSec, e.slug).toBeGreaterThanOrEqual(e.slug === "push-up" ? 90 : min);
      expect(e.suggestedRestSec, e.slug).toBeLessThanOrEqual(max);
    }
  });

  it("only gives a bodyweight share to exercises that move your body", () => {
    for (const e of EXERCISE_CATALOG) {
      expect(e.bodyweightRatio, e.slug).toBeGreaterThanOrEqual(0);
      expect(e.bodyweightRatio, e.slug).toBeLessThanOrEqual(1);
      if (e.equipment === "bodyweight") expect(e.bodyweightRatio, e.slug).toBeGreaterThan(0);
    }
  });
});
