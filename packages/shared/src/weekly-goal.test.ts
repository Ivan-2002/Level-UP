import { describe, expect, it } from "vitest";
import {
  addDays,
  countTrainingDays,
  evaluateWeek,
  firstWeekKind,
  goalProgressText,
  localDate,
  milestonesReached,
  nextStreak,
  nextWeeklyTarget,
  streakText,
  timeZoneSchema,
  weekStartOf,
  WEEKLY_GOAL,
  type WeekKind,
} from "./index.js";

const NY = "America/New_York"; // UTC-5 in November
const JHB = "Africa/Johannesburg"; // UTC+2, no daylight saving
const workout = (startedAt: string, completedSets = 3) => ({ startedAt, completedSets });

describe("local calendar", () => {
  it("finds the local day, not the UTC day", () => {
    expect(localDate("2026-11-13T02:30:00Z", NY)).toBe("2026-11-12"); // 21:30 Thursday in New York
    expect(localDate("2026-11-12T22:30:00Z", JHB)).toBe("2026-11-13"); // 00:30 Friday in Johannesburg
  });

  it("weeks start on Monday", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28"); // across a year end
  });

  it("adds days across month ends and daylight saving changes", () => {
    expect(addDays("2026-10-30", 7)).toBe("2026-11-06"); // US clocks change on 1 Nov 2026
    expect(addDays("2026-11-09", -7)).toBe("2026-11-02");
  });

  it("accepts real IANA time zones only", () => {
    expect(timeZoneSchema.safeParse(JHB).success).toBe(true);
    expect(timeZoneSchema.safeParse("Mars/Olympus").success).toBe(false);
  });
});

describe("countTrainingDays", () => {
  it("counts two workouts on one day once", () => {
    expect(countTrainingDays([workout("2026-11-10T06:00:00Z"), workout("2026-11-10T17:00:00Z")], JHB)).toBe(1);
  });

  it("needs at least 3 completed sets in a workout", () => {
    expect(countTrainingDays([workout("2026-11-10T06:00:00Z", 2), workout("2026-11-11T06:00:00Z", 3)], JHB)).toBe(1);
  });

  it("splits workouts just before and just after local midnight into two days", () => {
    const beforeMidnight = workout("2026-11-11T21:55:00Z"); // 23:55 Wednesday in Johannesburg
    const afterMidnight = workout("2026-11-11T22:05:00Z"); // 00:05 Thursday
    expect(countTrainingDays([beforeMidnight, afterMidnight], JHB)).toBe(2);
    // ...but in UTC they are the same date: the time zone is what makes them two days.
    expect(countTrainingDays([beforeMidnight, afterMidnight], "UTC")).toBe(1);
  });

  it("puts Sunday 23:55 and Monday 00:05 in different weeks", () => {
    const sunday = workout("2026-11-15T21:55:00Z");
    const monday = workout("2026-11-15T22:05:00Z");
    expect(countTrainingDays([sunday, monday], JHB, "2026-11-09")).toBe(1);
    expect(countTrainingDays([sunday, monday], JHB, "2026-11-16")).toBe(1);
  });

  it("uses the player's zone for an evening workout west of UTC", () => {
    // 21:00 Sunday in New York is already Monday in UTC.
    expect(countTrainingDays([workout("2026-11-16T02:00:00Z")], NY, "2026-11-09")).toBe(1);
  });
});

describe("nextWeeklyTarget", () => {
  const goal = (target: number, met: boolean) => ({ kind: "goal" as WeekKind, target, met });

  it("goes up one when met and down one when missed", () => {
    expect(nextWeeklyTarget(goal(2, true))).toBe(3);
    expect(nextWeeklyTarget(goal(3, false))).toBe(2);
  });

  it("stays within 2 and 4", () => {
    expect(nextWeeklyTarget(goal(4, true))).toBe(4);
    expect(nextWeeklyTarget(goal(2, false))).toBe(2);
  });

  it("doesn't move after a warm-up week", () => {
    expect(nextWeeklyTarget({ kind: "warm_up", target: 2, met: false })).toBe(2);
  });
});

describe("streaks and milestones", () => {
  it("adds a week when met and resets to 0 when missed", () => {
    expect(nextStreak(6, true)).toBe(7);
    expect(nextStreak(6, false)).toBe(0);
  });

  it("reaches a milestone on the week the streak arrives at it", () => {
    expect(milestonesReached(11, 12)).toEqual([{ weeks: 12, xp: 500 }]);
    expect(milestonesReached(12, 13)).toEqual([]);
    expect(milestonesReached(51, 52)).toEqual([{ weeks: 52, xp: 3000 }]);
    expect(milestonesReached(52, 53)).toEqual([]); // nothing after 52, for now
  });

  it("pays 12 weeks twice when the streak reaches it twice (after a reset)", () => {
    const paid: number[] = [];
    let streak = 0;
    const weeks = [...Array(12).fill(true), false, ...Array(12).fill(true)];
    for (const met of weeks) {
      const evaluation = evaluateWeek({ kind: "goal", target: 2, daysTrained: met ? 2 : 0, streakBefore: streak, closed: true });
      paid.push(...evaluation.milestones.map((m) => m.xp));
      streak = evaluation.streakAfter;
    }
    expect(paid).toEqual([500, 500]);
    expect(streak).toBe(12);
  });
});

describe("evaluateWeek", () => {
  const week = (daysTrained: number, closed: boolean, kind: WeekKind = "goal") => ({ kind, target: 3, daysTrained, streakBefore: 6, closed });

  it("pays the flat bonus once the goal is met, even mid-week", () => {
    expect(evaluateWeek(week(3, false))).toEqual({ met: true, streakAfter: 7, bonusXp: WEEKLY_GOAL.weeklyBonusXp, milestones: [] });
  });

  it("pays the same bonus for extra days", () => {
    expect(evaluateWeek(week(5, true)).bonusXp).toBe(60);
  });

  it("keeps the streak alive while the week is still open", () => {
    expect(evaluateWeek(week(1, false))).toMatchObject({ met: false, streakAfter: 6, bonusXp: 0 });
  });

  it("resets the streak once a week ends unmet", () => {
    expect(evaluateWeek(week(2, true))).toMatchObject({ met: false, streakAfter: 0 });
  });

  it("gives nothing and changes nothing in a warm-up week", () => {
    expect(evaluateWeek(week(4, true, "warm_up"))).toEqual({ met: false, streakAfter: 6, bonusXp: 0, milestones: [] });
  });
});

describe("firstWeekKind", () => {
  it("makes a mid-week signup a warm-up, in the player's zone", () => {
    expect(firstWeekKind("2026-11-14T10:00:00Z", JHB)).toBe("warm_up"); // Saturday
    expect(firstWeekKind("2026-11-15T23:00:00Z", JHB)).toBe("goal"); // 01:00 Monday in Johannesburg
    expect(firstWeekKind("2026-11-15T23:00:00Z", NY)).toBe("warm_up"); // still Sunday in New York
  });
});

describe("text", () => {
  it("shows goal progress", () => {
    expect(goalProgressText({ kind: "goal", target: 3, daysTrained: 2 })).toBe("2 of 3 days this week");
    expect(goalProgressText({ kind: "warm_up", target: 2, daysTrained: 1 })).toBe("Warm-up week · 1 day so far");
  });

  it("counts the week in progress and the weeks left to the next milestone", () => {
    expect(streakText({ kind: "goal", met: false, streak: 6 })).toBe("Week 7 · 5 to go for 12 weeks");
    expect(streakText({ kind: "goal", met: true, streak: 7 })).toBe("Week 7 · 5 to go for 12 weeks");
    expect(streakText({ kind: "goal", met: false, streak: 11 })).toBe("Week 12 · hit your goal for 12 weeks");
    expect(streakText({ kind: "goal", met: true, streak: 12 })).toBe("Week 12 · 14 to go for 26 weeks");
    expect(streakText({ kind: "goal", met: false, streak: 60 })).toBe("Week 61");
    expect(streakText({ kind: "warm_up", met: false, streak: 0 })).toBe("Your first goal week starts on Monday");
  });
});
