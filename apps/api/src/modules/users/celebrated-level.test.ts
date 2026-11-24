import request from "supertest";
import { describe, expect, it } from "vitest";
import { profileSchema, xpForLevel } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";
import { app, signUpPlayer, signUpUser, type TestUser } from "../../test/helpers.js";

// celebratedLevel: the highest level whose level-up screen was shown, on any phone.
// POST /profile/celebrated stores max(saved, min(sent, real level)): it only goes up,
// never past the real level, so repeats and late requests are harmless.

/** Sets the cached total XP (all the level reads); the ledger isn't needed here. */
const setTotalXp = (user: TestUser, totalXp: number) => prisma.profile.update({ where: { userId: user.userId }, data: { totalXp } });

async function celebrate(user: TestUser, level: number) {
  const res = await request(app).post("/v1/profile/celebrated").set("Cookie", user.cookie).send({ level });
  expect(res.status, res.text).toBe(200);
  return profileSchema.parse(res.body);
}

describe("POST /profile/celebrated", () => {
  it("starts a new character at level 1, celebrated", async () => {
    const user = await signUpPlayer();
    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
    expect(res.body).toMatchObject({ level: { level: 1 }, celebratedLevel: 1 });
  });

  it("remembers the level-up shown, and GET /profile returns it", async () => {
    const user = await signUpPlayer();
    await setTotalXp(user, xpForLevel(4));

    expect((await celebrate(user, 4)).celebratedLevel).toBe(4);
    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
    expect(res.body.celebratedLevel).toBe(4);
  });

  it("is safe to repeat, and a late, out-of-order request never lowers it", async () => {
    const user = await signUpPlayer();
    await setTotalXp(user, xpForLevel(4));

    await celebrate(user, 4);
    expect((await celebrate(user, 4)).celebratedLevel).toBe(4); // a retry
    expect((await celebrate(user, 2)).celebratedLevel).toBe(4); // an older request arriving last
  });

  it("keeps the highest when two requests race", async () => {
    const user = await signUpPlayer();
    await setTotalXp(user, xpForLevel(5));

    await Promise.all([3, 5, 4].map((level) => request(app).post("/v1/profile/celebrated").set("Cookie", user.cookie).send({ level })));

    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } })).celebratedLevel).toBe(5);
  });

  it("never goes past the real level", async () => {
    const user = await signUpPlayer();
    await setTotalXp(user, xpForLevel(4));

    expect((await celebrate(user, 9)).celebratedLevel).toBe(4);
  });

  it("isn't lowered when the level goes down (a correction), so the way back up isn't celebrated twice", async () => {
    const user = await signUpPlayer();
    await setTotalXp(user, xpForLevel(6));
    await celebrate(user, 6);

    await setTotalXp(user, xpForLevel(5)); // Milestone 7: an edit lowered the level
    expect((await celebrate(user, 5)).celebratedLevel).toBe(6);
  });

  it("rejects a level below 1, and needs a character and a session", async () => {
    const user = await signUpPlayer();
    const bad = await request(app).post("/v1/profile/celebrated").set("Cookie", user.cookie).send({ level: 0 });
    expect(bad.status).toBe(400);

    const noCharacter = await signUpUser();
    const missing = await request(app).post("/v1/profile/celebrated").set("Cookie", noCharacter.cookie).send({ level: 1 });
    expect(missing.status).toBe(404);

    expect((await request(app).post("/v1/profile/celebrated").send({ level: 1 })).status).toBe(401);
  });
});
