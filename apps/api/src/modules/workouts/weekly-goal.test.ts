import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { finishWorkoutResponseSchema, weeklyGoalStatusSchema, type WeeklyGoalStatus } from "@levelup/shared";
import { setNow } from "../../lib/clock.js";
import { prisma } from "../../lib/prisma.js";
import { app, seedExercises, signUpPlayer, signUpUser, type TestUser } from "../../test/helpers.js";

// The weekly goal, end to end: real HTTP, real database, the clock set to fixed dates.
// Times are written in Johannesburg local time (UTC+2), the player's zone. October 2026:
// Monday 5, 12, 19 and 26; Monday 2 November.
const TZ = "Africa/Johannesburg";
const at = (local: string) => `${local}+02:00`;

let ids: Record<string, string>;
beforeEach(async () => {
  ids = await seedExercises();
});

/** A player who signed up at a given local moment. */
async function playerSignedUpAt(local: string): Promise<TestUser> {
  setNow(at(local));
  return signUpPlayer({ timeZone: TZ });
}

/** Finishes a workout that started at `local` and lasted an hour (the clock moves to its end). */
async function train(user: TestUser, local: string, options: { sets?: number; clientId?: string } = {}) {
  const startedAt = new Date(at(local));
  const finishedAt = new Date(startedAt.getTime() + 3_600_000);
  setNow(finishedAt);
  const res = await request(app)
    .post("/workouts")
    .set("Cookie", user.cookie)
    .send({
      clientId: options.clientId ?? randomUUID(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      exercises: [{ exerciseId: ids["barbell-bench-press"], sets: Array.from({ length: options.sets ?? 3 }, () => ({ reps: 8, weightKg: 60 })) }],
    });
  expect(res.status, res.text).toBeLessThan(300);
  return finishWorkoutResponseSchema.parse(res.body);
}

/** Opens the app at a local moment: the rollover happens here. */
async function openApp(user: TestUser, local: string): Promise<WeeklyGoalStatus> {
  setNow(at(local));
  const res = await request(app).get("/weekly-goal").set("Cookie", user.cookie);
  expect(res.status, res.text).toBe(200);
  return weeklyGoalStatusSchema.parse(res.body);
}

const weeks = (user: TestUser) =>
  prisma.weeklyGoal
    .findMany({ where: { userId: user.userId }, orderBy: { weekStart: "asc" } })
    .then((rows) => rows.map((w) => ({ weekStart: w.weekStart.toISOString().slice(0, 10), kind: w.kind, target: w.target, daysTrained: w.daysTrained, met: w.met, streak: w.streakAfter, closed: w.closedAt !== null })));

const bonusRows = (user: TestUser) =>
  prisma.xpEvent.findMany({ where: { userId: user.userId, source: { in: ["weekly_goal", "streak_milestone"] } }, select: { source: true, amount: true } });

const totalXp = async (user: TestUser) => (await prisma.profile.findUniqueOrThrow({ where: { userId: user.userId } })).totalXp;

describe("GET /weekly-goal", () => {
  it("needs a session and a character", async () => {
    expect((await request(app).get("/weekly-goal")).status).toBe(401);
    const res = await request(app).get("/weekly-goal").set("Cookie", (await signUpUser()).cookie);
    expect([res.status, res.body.error]).toEqual([409, "ProfileRequired"]);
  });

  it("starts everyone at 2 days a week", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00"); // a Monday: a full first week

    expect(await openApp(user, "2026-10-05T09:00:00")).toEqual({ weekStart: "2026-10-05", kind: "goal", target: 2, daysTrained: 0, met: false, streak: 0 });
  });

  it("handles two requests at once (opening the app while a Finish is saving)", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    setNow(at("2026-10-19T09:00:00")); // two weeks to roll over
    const get = () => request(app).get("/weekly-goal").set("Cookie", user.cookie);

    const responses = await Promise.all([get(), get(), get()]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await weeks(user)).toHaveLength(3);
  });

  it("is safe to call again and again: nothing is created or paid twice", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    await train(user, "2026-10-06T07:00:00");
    await train(user, "2026-10-07T07:00:00");

    for (let i = 0; i < 3; i++) await openApp(user, "2026-10-14T09:00:00");

    expect(await weeks(user)).toHaveLength(2);
    expect(await bonusRows(user)).toEqual([{ source: "weekly_goal", amount: 60 }]);
  });
});

describe("a mid-week sign-up", () => {
  it("is a warm-up: set XP only, no bonus, no streak, and the target stays at 2", async () => {
    const user = await playerSignedUpAt("2026-10-10T10:00:00"); // Saturday
    await train(user, "2026-10-10T11:00:00");
    const sunday = await train(user, "2026-10-11T11:00:00");

    expect(sunday.summary.xp).toMatchObject({ weeklyGoal: 0, streakMilestone: 0 });
    expect(sunday.summary.weeklyGoal).toMatchObject({ kind: "warm_up", daysTrained: 2, met: false, streak: 0 });

    // Week 1 starts the following Monday, at 2 days.
    expect(await openApp(user, "2026-10-12T06:00:00")).toEqual({ weekStart: "2026-10-12", kind: "goal", target: 2, daysTrained: 0, met: false, streak: 0 });
    expect(await bonusRows(user)).toEqual([]);
  });
});

describe("training days", () => {
  it("counts two workouts on one day once, and pays the bonus once, to the workout that met the goal", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    await train(user, "2026-10-06T07:00:00");
    const sameDay = await train(user, "2026-10-06T18:00:00");
    expect(sameDay.summary.weeklyGoal).toMatchObject({ daysTrained: 1, met: false });

    const meets = await train(user, "2026-10-08T07:00:00", { clientId: "6f1d1c1e-0000-4000-8000-000000000001" });
    const extra = await train(user, "2026-10-09T07:00:00");

    expect(meets.summary.xp).toMatchObject({ weeklyGoal: 60, total: meets.summary.xp.sets + 60 });
    expect(meets.summary.weeklyGoal).toMatchObject({ daysTrained: 2, met: true, streak: 1 });
    expect(extra.summary.xp.weeklyGoal).toBe(0); // more days earn set XP only
    expect(extra.summary.weeklyGoal).toMatchObject({ daysTrained: 3, met: true, streak: 1 });

    // A repeated Finish (lost response) shows the same bonus and pays nothing new.
    const repeat = await train(user, "2026-10-08T07:00:00", { clientId: "6f1d1c1e-0000-4000-8000-000000000001" });
    expect(repeat.summary).toEqual(meets.summary);
    expect(await bonusRows(user)).toEqual([{ source: "weekly_goal", amount: 60 }]);
  });

  it("needs at least 3 completed sets", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    const short = await train(user, "2026-10-06T07:00:00", { sets: 2 });

    expect(short.summary.weeklyGoal).toMatchObject({ daysTrained: 0 });
  });

  it("counts workouts just before and just after local midnight as two days", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    await train(user, "2026-10-06T22:55:00"); // Tuesday 22:55 (ends 23:55)
    const afterMidnight = await train(user, "2026-10-07T00:05:00"); // Wednesday 00:05

    // In UTC these are both on Tuesday 6 October: only the player's zone makes them two days.
    expect(afterMidnight.summary.weeklyGoal).toMatchObject({ daysTrained: 2, met: true });
  });

  it("puts a late Sunday workout in its own week, even if the app opens on Monday", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    await train(user, "2026-10-06T07:00:00");
    await train(user, "2026-10-11T22:30:00"); // Sunday night (ends 23:30)

    const monday = await openApp(user, "2026-10-12T00:30:00");

    expect(monday).toMatchObject({ weekStart: "2026-10-12", target: 3, streak: 1 });
    expect((await weeks(user))[0]).toMatchObject({ daysTrained: 2, met: true, closed: true });
  });
});

describe("the target", () => {
  it("goes up to 4 as goals are met, never beyond, and down after a miss, resetting the streak", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    const plan: [week: string, days: number][] = [
      ["2026-10-0", 2], // target 2: met
      ["2026-10-1", 3], // target 3: met
      ["2026-10-2", 4], // target 4: met
    ];
    const mondays = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
    const dayOf = (monday: string, n: number) => {
      const d = new Date(`${monday}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    for (const [index, [, days]] of plan.entries()) {
      for (let n = 0; n < days; n++) await train(user, `${dayOf(mondays[index]!, n)}T07:00:00`);
    }
    await train(user, `${dayOf(mondays[3]!, 0)}T07:00:00`); // 26 Oct week, target 4: only 1 day

    const nextWeek = await openApp(user, "2026-11-02T08:00:00");

    expect((await weeks(user)).map((w) => [w.weekStart, w.target, w.met, w.streak])).toEqual([
      ["2026-10-05", 2, true, 1],
      ["2026-10-12", 3, true, 2],
      ["2026-10-19", 4, true, 3],
      ["2026-10-26", 4, false, 0], // stayed at the maximum of 4; the miss reset the streak
      ["2026-11-02", 3, false, 0], // one down after the miss
    ]);
    expect(nextWeek).toMatchObject({ target: 3, streak: 0 });
    expect((await bonusRows(user)).map((b) => b.amount)).toEqual([60, 60, 60]); // flat, at every target
  });

  it("steps down to 2 and no lower for a player back after 3 weeks away", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    await train(user, "2026-10-06T07:00:00");
    await train(user, "2026-10-07T07:00:00"); // week 1 met: target 3 next

    // Away for the weeks of 12, 19 and 26 October. The app opens again on 2 November.
    const back = await openApp(user, "2026-11-02T08:00:00");

    expect((await weeks(user)).map((w) => [w.weekStart, w.target, w.daysTrained, w.met, w.streak, w.closed])).toEqual([
      ["2026-10-05", 2, 2, true, 1, true],
      ["2026-10-12", 3, 0, false, 0, true], // each missed week is processed, in order
      ["2026-10-19", 2, 0, false, 0, true],
      ["2026-10-26", 2, 0, false, 0, true], // the minimum
      ["2026-11-02", 2, 0, false, 0, false],
    ]);
    expect(back).toEqual({ weekStart: "2026-11-02", kind: "goal", target: 2, daysTrained: 0, met: false, streak: 0 });
  });
});

describe("streak milestones", () => {
  /**
   * Pretends the player already met the goal for `streak` weeks in a row up to the week
   * before `monday` (a closed row, as rollover leaves it). Rollover then opens `monday`'s
   * week from it. In the second use, the weeks in between simply have no rows.
   */
  async function streakBefore(user: TestUser, monday: string, streak: number) {
    const previous = new Date(`${monday}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 7);
    await prisma.weeklyGoal.create({
      data: { userId: user.userId, weekStart: previous, kind: "goal", target: 2, daysTrained: 2, met: true, streakAfter: streak, closedAt: new Date() },
    });
  }

  it("pays 12 weeks every time it is reached, and awards the badge only once", async () => {
    const user = await playerSignedUpAt("2026-01-05T08:00:00");

    // First time: 11 weeks done (the last at target 2, so this week's target is 3);
    // the 12th week is met on Wednesday 7 October.
    await streakBefore(user, "2026-10-05", 11);
    await train(user, "2026-10-05T07:00:00");
    await train(user, "2026-10-06T07:00:00");
    const twelve = await train(user, "2026-10-07T07:00:00");
    expect(twelve.summary.xp).toMatchObject({ weeklyGoal: 60, streakMilestone: 500 });
    expect(twelve.summary.weeklyGoal).toMatchObject({ streak: 12, met: true });

    // A reset later, then another 11 weeks; the 12th met on Wednesday 4 November.
    await streakBefore(user, "2026-11-02", 11);
    await train(user, "2026-11-02T07:00:00");
    await train(user, "2026-11-03T07:00:00");
    const again = await train(user, "2026-11-04T07:00:00");
    expect(again.summary.xp).toMatchObject({ weeklyGoal: 60, streakMilestone: 500 });

    expect((await bonusRows(user)).filter((b) => b.source === "streak_milestone")).toHaveLength(2);
    expect(await prisma.userAchievement.findMany({ where: { userId: user.userId }, select: { key: true } })).toEqual([{ key: "streak_12" }]);
    expect(await totalXp(user)).toBe(6 * twelve.summary.xp.sets + 2 * (60 + 500)); // the cached total includes every bonus
  });
});

describe("edge cases", () => {
  it("a workout from a week that has already closed earns set XP but doesn't reopen the week", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");
    await train(user, "2026-10-06T07:00:00");
    await openApp(user, "2026-10-12T08:00:00"); // closes the first week: 1 of 2, missed

    // Logged offline on Sunday 11 October, synced on Tuesday.
    const late = await train(user, "2026-10-11T09:00:00");
    setNow(at("2026-10-13T08:00:00"));

    expect(late.summary.xp).toMatchObject({ weeklyGoal: 0 });
    expect(late.summary.xp.sets).toBeGreaterThan(0);
    expect((await weeks(user))[0]).toMatchObject({ daysTrained: 1, met: false, closed: true });
  });

  it("follows the phone to a new time zone (PATCH /profile)", async () => {
    const user = await playerSignedUpAt("2026-10-05T08:00:00");

    const res = await request(app).patch("/profile").set("Cookie", user.cookie).send({ timeZone: "America/New_York" });

    expect([res.status, res.body.timeZone]).toEqual([200, "America/New_York"]);
  });
});
