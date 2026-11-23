import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { levelStatus, xpForLevel } from "@levelup/shared";
import { env } from "../../config/env.js";
import { setNow } from "../../lib/clock.js";
import { prisma } from "../../lib/prisma.js";
import { app, signUpPlayer } from "../../test/helpers.js";
import * as usersService from "../users/users.service.js";
import { grantDevXp, setXpOnDay } from "./progression.service.js";

// grantDevXp: test XP for development (`pnpm --filter api dev:grant-xp`), through the ledger
// like any other gain, with its own source so it never passes for earned XP.

afterEach(() => setNow(null));

describe("grantDevXp", () => {
  it("adds a dev_grant ledger row and raises the total and the level the app reads", async () => {
    const user = await signUpPlayer({ timeZone: "Africa/Johannesburg" });
    setNow("2026-11-23T23:30:00Z"); // already the 24th in Johannesburg (UTC+2)

    expect(await grantDevXp(user.userId, xpForLevel(4))).toBe(xpForLevel(4));
    expect(await grantDevXp(user.userId, 10)).toBe(xpForLevel(4) + 10); // each grant is its own row

    const rows = await prisma.xpEvent.findMany({ where: { userId: user.userId }, orderBy: { amount: "desc" } });
    expect(rows.map((r) => [r.source, r.amount, r.bodyPart, r.earnedOn.toISOString().slice(0, 10)])).toEqual([
      ["dev_grant", xpForLevel(4), null, "2026-11-24"],
      ["dev_grant", 10, null, "2026-11-24"],
    ]);
    const res = await request(app).get("/v1/profile").set("Cookie", user.cookie);
    expect(res.body).toMatchObject({ totalXp: xpForLevel(4) + 10, level: levelStatus(xpForLevel(4) + 10), celebratedLevel: 1 });
  });

  it("doesn't count toward the daily cap", async () => {
    const user = await signUpPlayer();
    setNow("2026-11-23T10:00:00Z");
    await grantDevXp(user.userId, 50_000);
    expect(await setXpOnDay(user.userId, "2026-11-23")).toBe(0);
  });

  it("refuses in production, and refuses an amount that isn't a positive whole number", async () => {
    const user = await signUpPlayer();
    const nodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      await expect(grantDevXp(user.userId, 100)).rejects.toThrow(/disabled in production/);
    } finally {
      env.NODE_ENV = nodeEnv;
    }
    await expect(grantDevXp(user.userId, 0)).rejects.toThrow(/positive whole number/);
    await expect(grantDevXp(user.userId, 1.5)).rejects.toThrow(/positive whole number/);
    expect(await prisma.xpEvent.count()).toBe(0);
  });
});

describe("userIdByEmail", () => {
  it("finds the account ignoring case, or returns null", async () => {
    const user = await signUpPlayer();
    expect(await usersService.userIdByEmail(user.email.toUpperCase())).toBe(user.userId);
    expect(await usersService.userIdByEmail("nobody@example.com")).toBeNull();
  });
});
