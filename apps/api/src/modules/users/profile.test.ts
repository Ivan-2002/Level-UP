import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { BODYWEIGHT_FALLBACK_KG, BODYWEIGHT_XP, levelStatus, localDate, profileSchema } from "@levelup/shared";
import { setNow } from "../../lib/clock.js";
import { prisma } from "../../lib/prisma.js";
import { app, signUpUser, type TestUser } from "../../test/helpers.js";

const validCharacter = { username: "IvanLifts", bodyweightKg: 75.5, timeZone: "Africa/Johannesburg" };

function createProfile(user: TestUser, body: object) {
  return request(app).post("/v1/profile").set("Cookie", user.cookie).send(body);
}

describe("profile routes without a session", () => {
  it.each([
    ["GET", () => request(app).get("/v1/profile")],
    ["POST", () => request(app).post("/v1/profile").send(validCharacter)],
  ])("%s /profile returns 401", async (_method, send) => {
    const res = await send();

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

describe("GET /profile", () => {
  it("returns 404 ProfileNotFound before a character exists", async () => {
    const user = await signUpUser();

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);

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
      level: { level: 1, xpIntoLevel: 0, xpForNextLevel: 400 },
      stage: { key: "rookie", name: "Rookie", levelRequired: 1 },
      celebratedLevel: 1,
      xpBodyweightKg: 75.5,
      createdAt: expect.any(String),
    });

    const fetched = await request(app).get("/v1/profile").set("Cookie", user.cookie);
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
      .post("/v1/profile")
      .set("Cookie", user.cookie)
      .set("Content-Type", "application/json")
      .send('{"username":');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BadRequest");
  });

  it("saves nothing when validation fails", async () => {
    await createProfile(user, { ...validCharacter, timeZone: "Nowhere" });

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
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

    const res = await request(app).patch("/v1/profile").set("Cookie", user.cookie).send({ weightUnit: "lb" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: "IvanLifts",
      timeZone: "Africa/Johannesburg",
      bodyweightKg: 75.5,
      weightUnit: "lb",
    });
    expect((await request(app).get("/v1/profile").set("Cookie", user.cookie)).body.weightUnit).toBe("lb");
  });

  it("rejects an unknown unit, an empty change, and a missing character", async () => {
    await createProfile(user, validCharacter);
    const patch = (as: TestUser, body: object) => request(app).patch("/v1/profile").set("Cookie", as.cookie).send(body);

    const unknown = await patch(user, { weightUnit: "stone" });
    const empty = await patch(user, {});
    const noCharacter = await patch(await signUpUser(), { weightUnit: "lb" });

    expect([unknown.status, empty.status, noCharacter.status]).toEqual([400, 400, 404]);
    expect(empty.body.message).toBe("Send at least one field to change.");
    expect(noCharacter.body.error).toBe("ProfileNotFound");
  });

  it("needs a session", async () => {
    expect((await request(app).patch("/v1/profile").send({ weightUnit: "lb" })).status).toBe(401);
  });
});

describe("GET /profile: what the XP bar and the offline preview need", () => {
  it("sends the level status worked out from the total XP", async () => {
    const user = await signUpUser();
    await createProfile(user, validCharacter);
    await prisma.profile.update({ where: { userId: user.userId }, data: { totalXp: 500 } });

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);

    expect(res.body).toMatchObject({ totalXp: 500, level: levelStatus(500) });
    expect(res.body.level).toMatchObject({ level: 2, xpIntoLevel: 100 });
  });

  it("sends the XP bodyweight: an overnight drop barely moves it, while bodyweightKg shows what was typed", async () => {
    const user = await signUpUser();
    setNow(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // signed up a month ago: past the grace week
    await createProfile(user, { username: "Dropper", timeZone: "UTC" });
    setNow(null);
    const day = (daysAgo: number) => localDate(new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000), "UTC");
    await request(app)
      .post("/v1/bodyweight")
      .set("Cookie", user.cookie)
      .send({ kg: 80, measuredOn: day(3) });
    await request(app)
      .post("/v1/bodyweight")
      .set("Cookie", user.cookie)
      .send({ kg: 40, measuredOn: day(0) });

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);

    expect(res.body.bodyweightKg).toBe(40);
    expect(res.body.xpBodyweightKg).toBeCloseTo(80, 1);
  });

  it("can't have the XP bodyweight reset by re-entering every date (80 -> 40 kg)", async () => {
    // The old hole: re-entering EVERY entry's date replaced every entry, so the first edit
    // became an unchecked "first entry". Receipts keep the original writes in the walk.
    const user = await signUpUser();
    setNow("2026-07-01T08:00:00Z"); // signed up well before, so the grace week is long over
    await createProfile(user, { username: "Resetter", timeZone: "UTC" });
    const record = (kg: number, measuredOn: string) =>
      request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg, measuredOn });

    setNow("2026-08-01T08:00:00Z");
    await record(80, "2026-08-01");
    setNow("2026-08-08T08:00:00Z");
    await record(80, "2026-08-08");
    setNow("2026-08-09T08:00:00Z");
    await record(40, "2026-08-01");
    setNow("2026-08-09T08:01:00Z");
    await record(40, "2026-08-08");

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
    setNow(null);

    expect(res.body.bodyweightKg).toBe(40); // what the player typed is still shown
    // One day's allowance since the last 80 kg receipt: about 79.8, not 40.
    expect(res.body.xpBodyweightKg).toBeCloseTo(80 - (80 * BODYWEIGHT_XP.maxChangePerWeek) / 7, 1);
  });

  it("lets a new player correct a mistyped first weight in the first week: 120 -> 80 kg on day 2", async () => {
    const user = await signUpUser();
    const signUp = Date.parse("2026-09-01T08:00:00Z");
    setNow(new Date(signUp));
    await createProfile(user, { username: "Typo", bodyweightKg: 120, timeZone: "UTC" });
    setNow(new Date(signUp + 2 * 24 * 60 * 60 * 1000));
    await request(app).post("/v1/bodyweight").set("Cookie", user.cookie).send({ kg: 80, measuredOn: "2026-09-03" });

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
    setNow(null);

    expect(res.body.bodyweightKg).toBe(80);
    expect(res.body.xpBodyweightKg).toBe(80);
  });

  it("matches the shared profileSchema, which the app uses to check its saved copy", async () => {
    const user = await signUpUser();
    await createProfile(user, validCharacter);

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);

    expect(profileSchema.safeParse(res.body).success).toBe(true);
  });

  it("uses the 75 kg fallback when no bodyweight was ever entered", async () => {
    const user = await signUpUser();
    await createProfile(user, { username: "NoScale" });

    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);

    expect(res.body.xpBodyweightKg).toBe(BODYWEIGHT_FALLBACK_KG);
  });
});
