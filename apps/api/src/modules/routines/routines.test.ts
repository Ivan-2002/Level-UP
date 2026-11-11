import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { routineListSchema, routineSchema, type RoutineInput } from "@levelup/shared";
import { app, seedExercises, signUpUser, type TestUser } from "../../test/helpers.js";

let ids: Record<string, string>;
let user: TestUser;

beforeEach(async () => {
  ids = await seedExercises();
  user = await signUpUser();
});

const pushDay = (): RoutineInput => ({
  name: "Push day",
  exercises: [
    { exerciseId: ids["barbell-bench-press"]!, targetSets: 4, targetReps: 8, restSec: 150 },
    { exerciseId: ids["lateral-raise"]!, targetSets: 3, targetReps: 15 }, // no restSec: use the suggestion
  ],
});

const create = (as: TestUser, body: unknown) => request(app).post("/routines").set("Cookie", as.cookie).send(body as object);

describe("routines without a session", () => {
  it.each([
    ["GET /routines", () => request(app).get("/routines")],
    ["POST /routines", () => request(app).post("/routines").send({})],
    ["GET /routines/:id", () => request(app).get(`/routines/${randomUUID()}`)],
    ["PUT /routines/:id", () => request(app).put(`/routines/${randomUUID()}`).send({})],
    ["DELETE /routines/:id", () => request(app).delete(`/routines/${randomUUID()}`)],
  ])("%s returns 401", async (_route, send) => {
    expect((await send()).status).toBe(401);
  });
});

describe("POST /routines", () => {
  it("creates a routine with its exercises in order", async () => {
    const res = await create(user, pushDay());

    expect(res.status).toBe(201);
    const routine = routineSchema.parse(res.body);
    expect(routine).toMatchObject({ name: "Push day", lastDoneAt: null });
    expect(routine.exercises.map((e) => [e.order, e.exercise.name, e.targetSets, e.targetReps, e.restSec])).toEqual([
      [0, "Bench Press", 4, 8, 150],
      [1, "Lateral Raise", 3, 15, null],
    ]);
  });

  it.each<[string, (r: RoutineInput) => unknown, string]>([
    ["an empty name", (r) => ({ ...r, name: "  " }), "name"],
    ["no exercises", (r) => ({ ...r, exercises: [] }), "exercises"],
    ["0 target sets", (r) => ({ ...r, exercises: [{ ...r.exercises[0]!, targetSets: 0 }] }), "exercises.0.targetSets"],
    ["a rest that isn't a 15 s step", (r) => ({ ...r, exercises: [{ ...r.exercises[0]!, restSec: 100 }] }), "exercises.0.restSec"],
    ["a rest over 10 minutes", (r) => ({ ...r, exercises: [{ ...r.exercises[0]!, restSec: 615 }] }), "exercises.0.restSec"],
  ])("rejects %s", async (_case, change, path) => {
    const res = await create(user, change(pushDay()));

    expect(res.status).toBe(400);
    expect(res.body.issues.map((i: { path: string }) => i.path)).toContain(path);
  });

  it("rejects an exercise that doesn't exist", async () => {
    const res = await create(user, { name: "Mystery", exercises: [{ exerciseId: randomUUID(), targetSets: 3, targetReps: 8 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("UnknownExercise");
  });
});

describe("GET /routines", () => {
  it("lists your routines in the order you made them, with counts and last done", async () => {
    await create(user, pushDay());
    await create(user, { name: "Pull day", exercises: [{ exerciseId: ids["pull-up"]!, targetSets: 4, targetReps: 8 }] });
    await create(await signUpUser(), { ...pushDay(), name: "Someone else's" });

    const res = await request(app).get("/routines").set("Cookie", user.cookie);

    expect(res.status).toBe(200);
    expect(routineListSchema.parse(res.body).items.map((r) => [r.name, r.exerciseCount, r.lastDoneAt])).toEqual([
      ["Push day", 2, null],
      ["Pull day", 1, null],
    ]);
  });
});

describe("one routine", () => {
  it("can be read, replaced and deleted", async () => {
    const { id } = (await create(user, pushDay())).body;

    const read = await request(app).get(`/routines/${id}`).set("Cookie", user.cookie);
    expect(read.status).toBe(200);

    const replaced = await request(app)
      .put(`/routines/${id}`)
      .set("Cookie", user.cookie)
      .send({ name: "Push day v2", exercises: [{ exerciseId: ids["overhead-press"]!, targetSets: 5, targetReps: 5, restSec: 180 }] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.name).toBe("Push day v2");
    expect(replaced.body.exercises.map((e: { exercise: { name: string } }) => e.exercise.name)).toEqual(["Overhead Press"]);

    const deleted = await request(app).delete(`/routines/${id}`).set("Cookie", user.cookie);
    expect(deleted.status).toBe(204);
    expect((await request(app).get(`/routines/${id}`).set("Cookie", user.cookie)).status).toBe(404);
  });

  it("is a 404 for another user on read, replace and delete, and stays unchanged", async () => {
    const { id } = (await create(user, pushDay())).body;
    const intruder = await signUpUser();

    const read = await request(app).get(`/routines/${id}`).set("Cookie", intruder.cookie);
    const replaced = await request(app).put(`/routines/${id}`).set("Cookie", intruder.cookie).send({ ...pushDay(), name: "Hacked" });
    const deleted = await request(app).delete(`/routines/${id}`).set("Cookie", intruder.cookie);

    expect([read.status, replaced.status, deleted.status]).toEqual([404, 404, 404]);
    expect(read.body).toEqual({ error: "RoutineNotFound", message: "Routine not found." });
    expect((await request(app).get(`/routines/${id}`).set("Cookie", user.cookie)).body.name).toBe("Push day");
  });

  it("is a 404 for an id that isn't a UUID", async () => {
    expect((await request(app).get("/routines/push-day").set("Cookie", user.cookie)).status).toBe(404);
  });
});
