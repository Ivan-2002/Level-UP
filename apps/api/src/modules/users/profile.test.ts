import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app, signUpUser, type TestUser } from "../../test/helpers.js";

const validCharacter = { username: "IvanLifts", bodyweightKg: 75.5, timeZone: "Africa/Johannesburg" };

function createProfile(user: TestUser, body: object) {
  return request(app).post("/profile").set("Cookie", user.cookie).send(body);
}

describe("profile routes without a session", () => {
  it.each([
    ["GET", () => request(app).get("/profile")],
    ["POST", () => request(app).post("/profile").send(validCharacter)],
  ])("%s /profile returns 401", async (_method, send) => {
    const res = await send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

describe("GET /profile", () => {
  it("returns 404 ProfileNotFound before a character exists", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/profile").set("Cookie", user.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("ProfileNotFound");
  });
});

describe("POST /profile", () => {
  let user: TestUser;
  beforeEach(async () => {
    user = await signUpUser();
  });

  it("creates the character, and GET /profile then returns it", async () => {
    const created = await createProfile(user, validCharacter);

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      username: "IvanLifts",
      bodyweightKg: 75.5, // a plain number, not Prisma's Decimal
      weightUnit: "kg", // the default when the app sends none
      timeZone: "Africa/Johannesburg",
      totalXp: 0,
      createdAt: expect.any(String),
    });

    const fetched = await request(app).get("/profile").set("Cookie", user.cookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it("allows leaving bodyweight out, and then records no bodyweight", async () => {
    const res = await createProfile(user, { username: "NoScale" });

    expect(res.status).toBe(201);
    expect(res.body.bodyweightKg).toBeNull();
    expect(await prisma.bodyweightEntry.count()).toBe(0);
  });

  it("stores bodyweight as a dated history entry, not on the profile", async () => {
    await createProfile(user, validCharacter);

    const entries = await prisma.bodyweightEntry.findMany({ where: { userId: user.userId } });
    expect(entries.map((e) => [e.kg.toNumber(), e.measuredOn.toISOString().slice(0, 10)])).toEqual([
      [75.5, new Date().toISOString().slice(0, 10)],
    ]);
  });

  it("records no bodyweight when the username is taken", async () => {
    await createProfile(user, validCharacter);
    const otherUser = await signUpUser();

    await createProfile(otherUser, { ...validCharacter, bodyweightKg: 90 });

    expect(await prisma.bodyweightEntry.count({ where: { userId: otherUser.userId } })).toBe(0);
  });

  it("rejects a second character for the same user with 409 ProfileExists", async () => {
    await createProfile(user, validCharacter);

    const res = await createProfile(user, { ...validCharacter, username: "SecondTry" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("ProfileExists");
  });

  it("rejects a username another player has with 409 UsernameTaken", async () => {
    await createProfile(user, validCharacter);
    const otherUser = await signUpUser();

    const res = await createProfile(otherUser, validCharacter);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("UsernameTaken");
  });

  it("treats usernames that differ only in case as the same", async () => {
    await createProfile(user, validCharacter);
    const otherUser = await signUpUser();

    const res = await createProfile(otherUser, { ...validCharacter, username: "ivanlifts" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("UsernameTaken");
  });

  it("rejects a username that is too short, naming the field", async () => {
    const res = await createProfile(user, { ...validCharacter, username: "ab" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "ValidationError",
      message: "Username must be at least 3 characters.",
      issues: [{ path: "username", message: "Username must be at least 3 characters." }],
    });
  });

  it("rejects an unknown time zone", async () => {
    const res = await createProfile(user, { ...validCharacter, timeZone: "Mars/Olympus" });

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([{ path: "timeZone", message: "Unknown time zone." }]);
  });

  it("defaults the time zone to UTC when the app sends none", async () => {
    const res = await createProfile(user, { username: "NoZone" });

    expect(res.body.timeZone).toBe("UTC");
  });

  it("rejects malformed JSON with 400 instead of a server error", async () => {
    const res = await request(app)
      .post("/profile")
      .set("Cookie", user.cookie)
      .set("Content-Type", "application/json")
      .send('{"username":');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("saves nothing when validation fails", async () => {
    await createProfile(user, { ...validCharacter, timeZone: "Nowhere" });

    const res = await request(app).get("/profile").set("Cookie", user.cookie);
    expect(res.status).toBe(404);
  });
});

describe("weight unit (kg / lb)", () => {
  let user: TestUser;
  beforeEach(async () => {
    user = await signUpUser();
  });

  it("is chosen at sign-up (the app sends one from the device locale)", async () => {
    const res = await createProfile(user, { ...validCharacter, weightUnit: "lb" });

    expect(res.status).toBe(201);
    expect(res.body.weightUnit).toBe("lb");
  });

  it("can be changed later with PATCH /profile, leaving everything else as it was", async () => {
    await createProfile(user, validCharacter);

    const res = await request(app).patch("/profile").set("Cookie", user.cookie).send({ weightUnit: "lb" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "IvanLifts", timeZone: "Africa/Johannesburg", bodyweightKg: 75.5, weightUnit: "lb" });
    expect((await request(app).get("/profile").set("Cookie", user.cookie)).body.weightUnit).toBe("lb");
  });

  it("rejects an unknown unit, an empty change, and a missing character", async () => {
    await createProfile(user, validCharacter);
    const patch = (as: TestUser, body: object) => request(app).patch("/profile").set("Cookie", as.cookie).send(body);

    const unknown = await patch(user, { weightUnit: "stone" });
    const empty = await patch(user, {});
    const noCharacter = await patch(await signUpUser(), { weightUnit: "lb" });

    expect([unknown.status, empty.status, noCharacter.status]).toEqual([400, 400, 404]);
    expect(empty.body.message).toBe("Send at least one field to change.");
    expect(noCharacter.body.error).toBe("ProfileNotFound");
  });

  it("needs a session", async () => {
    expect((await request(app).patch("/profile").send({ weightUnit: "lb" })).status).toBe(401);
  });
});
