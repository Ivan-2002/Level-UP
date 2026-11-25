import {
  applyDailyCap,
  bodyweightOnDate,
  exerciseXpHistory,
  isTooOldForXp,
  scoreSessionSets,
  xpBodyweightOnDate,
  type BodyPart,
  type ExerciseXpHistory,
  type ScoredSet,
  type ScoringExercise,
  type SessionSet,
  type BodyweightEntry,
  XP_SOURCES_UNDER_DAILY_CAP,
  localDate,
} from "@levelup/shared";
import { randomUUID } from "node:crypto";
import type { XpHeldBackReason } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { now } from "../../lib/clock.js";
import { devToolRefusal } from "../../lib/dev-only.js";
import { prisma, type Db } from "../../lib/prisma.js";
import * as usersService from "../users/users.service.js";
import * as repo from "./progression.repository.js";

// The XP ledger, and the only module that works out XP. The RULES are pure functions in
// @levelup/shared (scoreSessionSets and friends); this module feeds them the player's data
// and records the result.
// Dependencies: progression -> users (bodyweight, cached total). Nothing here reads
// workouts: Finish passes in the sets and the exercise history it loaded.

/** One earlier session of an exercise, as Finish loaded it: its non-flagged sets. */
export type PastSession = { startedAt: Date; sets: { reps: number; weightKg: number }[] };

export type WorkoutToScore = {
  startedAt: Date;
  /** When the server received it (the 14-day rule). */
  receivedAt: Date;
  /** The local day it started ("YYYY-MM-DD"): the daily cap's day. */
  earnedOn: string;
  /** Every set of the workout, in the order logged (exercise by exercise), with completedAt when the app sent it. */
  sets: SessionSet[];
  exercises: Map<string, ScoringExercise>;
  /** Per exercise in the workout: its sessions in workouts that started earlier, oldest first. */
  pastSessions: Map<string, PastSession[]>;
};

export type WorkoutScore = {
  /** One per input set, in the same order: what scoring decided (flags, tags, XP before the day's limits). */
  sets: ScoredSet[];
  /** One per input set: the XP actually awarded, after the 14-day rule and the daily cap. */
  awardedXp: number[];
  /** Set XP the workout didn't get, and why; null when it got it all. */
  heldBack: { amount: number; reason: XpHeldBackReason } | null;
  /** The real bodyweight in effect that day (lifted kg, PRs, the summary). */
  bodyweightKg: number;
};

/**
 * Scores a workout's sets with the shared pipeline (plausibility, jump cap, effort, tags,
 * the 10-set limit, set XP), using the XP bodyweight on its start date and the player's
 * history with each exercise; then applies the day's limits: no set XP for a workout that
 * started more than 14 days before it arrived, else the daily cap against the XP already
 * recorded on its day. Reads only; Finish stores the result.
 *
 * Call it inside the Finish transaction (`db`) AFTER locking the player's profile row: the
 * lock makes two Finishes for one player run one after the other, so the second one counts
 * the first one's XP and can't also fit under the cap.
 */
export async function scoreWorkout(db: Db, userId: string, workout: WorkoutToScore): Promise<WorkoutScore> {
  const bodyweights = await usersService.bodyweightHistory(userId, db);
  const { receipts, signedUpAt } = await usersService.xpBodyweightInput(userId, db);
  const date = workout.startedAt.toISOString();
  const typed = bodyweightOnDate(bodyweights, date);

  const history = historiesFrom(bodyweights, workout.pastSessions, workout.exercises, date);

  const score = scoreSessionSets({
    sets: workout.sets,
    exercises: workout.exercises,
    history,
    bodyweight: { xp: xpBodyweightOnDate(receipts, date, { signedUpAt }), typed },
  });
  const setXp = score.sets.map((s) => s.xp);
  const scored = setXp.reduce((a, b) => a + b, 0);

  if (isTooOldForXp(workout.startedAt, workout.receivedAt)) {
    return {
      sets: score.sets,
      awardedXp: setXp.map(() => 0),
      heldBack: heldBack(scored, "too_old"),
      bodyweightKg: typed,
    };
  }
  const dayXpBefore = await repo.sumXpOnDay(db, userId, workout.earnedOn, XP_SOURCES_UNDER_DAILY_CAP);
  const capped = applyDailyCap(dayXpBefore, setXp);
  return {
    sets: score.sets,
    awardedXp: capped.awarded,
    heldBack: heldBack(capped.heldBack, "daily_cap"),
    bodyweightKg: typed,
  };
}

/**
 * Set XP already awarded on a local day (the daily cap's count, as Finish sums it):
 * what the app's live preview starts the day from (GET /exercises/xp-history).
 */
export async function setXpOnDay(userId: string, earnedOn: string): Promise<number> {
  return repo.sumXpOnDay(prisma, userId, earnedOn, XP_SOURCES_UNDER_DAILY_CAP);
}

// Zero means nothing was held back: no reason (the database's CHECK insists on that).
const heldBack = (amount: number, reason: XpHeldBackReason) => (amount > 0 ? { amount, reason } : null);

/**
 * Each exercise's XP history (12-week best, jump baseline) as of `at`, from its past
 * sessions: what the app needs to preview XP offline (GET /exercises/xp-history).
 * The same calculation Finish uses. Exercises missing from `exercises` are left out.
 */
export async function xpHistories(
  userId: string,
  pastSessions: Map<string, PastSession[]>,
  exercises: Map<string, ScoringExercise>,
  at: Date,
): Promise<Map<string, ExerciseXpHistory>> {
  return historiesFrom(await usersService.bodyweightHistory(userId), pastSessions, exercises, at.toISOString());
}

/** Past sessions -> ExerciseXpHistory, valuing each session at the bodyweight in effect on its day. */
function historiesFrom(
  bodyweights: BodyweightEntry[],
  pastSessions: Map<string, PastSession[]>,
  exercises: Map<string, ScoringExercise>,
  date: string,
): Map<string, ExerciseXpHistory> {
  const histories = new Map<string, ExerciseXpHistory>();
  for (const [exerciseId, sessions] of pastSessions) {
    const exercise = exercises.get(exerciseId);
    if (!exercise) continue;
    const past = sessions.map((s) => {
      const day = s.startedAt.toISOString();
      return { date: day, bodyweightKg: bodyweightOnDate(bodyweights, day), sets: s.sets };
    });
    histories.set(exerciseId, exerciseXpHistory(past, exercise, date));
  }
  return histories;
}

/** One set's award: its XP after the day's limits, its body part, and its growth stimulus (setStimulus). */
export type SetXpAward = { setId: string; amount: number; bodyPart: BodyPart; stimulus: number };

/**
 * Records XP and growth stimulus for completed sets and adds the XP to the cached total,
 * inside the caller's transaction (Finish). Zero-XP sets get no ledger row, so they grow
 * nothing either (a workout synced too late, or sets past the daily ceiling). `earnedOn`: the local day the
 * workout started ("YYYY-MM-DD"), the daily cap's day.
 */
export async function awardSetXp(db: Db, userId: string, awards: SetXpAward[], earnedOn: string): Promise<number> {
  const earning = awards.filter((a) => a.amount > 0);
  await repo.insertSetXpEvents(
    db,
    earning.map((a) => ({
      userId,
      amount: a.amount,
      sourceId: a.setId,
      bodyPart: a.bodyPart,
      earnedOn,
      stimulus: a.stimulus,
    })),
  );
  const earned = earning.reduce((sum, a) => sum + a.amount, 0);
  if (earned > 0) await usersService.addTotalXp(db, userId, earned);
  return earned;
}

/**
 * What one workout earned (per set, and in total), and the player's total just before it:
 * the XP recorded before the workout was saved. Read from the ledger on every request, so
 * a repeated Finish shows the same numbers.
 */
export async function workoutXp(
  userId: string,
  setIds: string[],
  savedAt: Date,
): Promise<{ perSet: Map<string, number>; earned: number; totalBefore: number }> {
  const [perSet, totalBefore] = await Promise.all([repo.setXpBySet(setIds), repo.sumXpBefore(userId, savedAt)]);
  return { perSet, earned: [...perSet.values()].reduce((a, b) => a + b, 0), totalBefore };
}

/**
 * DEVELOPMENT ONLY: adds `amount` XP to a player through the ledger, so a level-up can be
 * tested without weeks of workouts (`pnpm --filter api dev:grant-xp`). One `dev_grant` row
 * (a new UUID as its sourceId, no body part, today's local date) and the cached total, in one
 * transaction. dev_grant is outside the daily cap, so it doesn't eat into the day's set XP.
 * Refuses in production or against a non-local database (devToolRefusal), even if something
 * other than the script calls it. Returns the new total.
 */
export async function grantDevXp(userId: string, amount: number): Promise<number> {
  const refusal = devToolRefusal(env);
  if (refusal) throw new Error(refusal);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive whole number.");
  const earnedOn = localDate(now(), await usersService.timeZoneOf(userId));
  return prisma.$transaction(async (tx) => {
    await repo.insertBonusXpEvent(tx, { userId, amount, source: "dev_grant", sourceId: randomUUID(), earnedOn });
    return usersService.addTotalXp(tx, userId, amount);
  });
}

/**
 * DEVELOPMENT ONLY: backdated training for one body part, to see the avatar grow and shrink
 * on a phone without months of workouts (`pnpm --filter api dev:grant-xp <email> --part legs`).
 * One dev_grant row a week for `weeks` weeks, the last one on `until` (a local day), each
 * with `setsPerWeek` of stimulus (hard sets) and no XP: development only, never the level.
 * Refuses like grantDevXp. Returns the days written.
 */
export async function grantDevTraining(
  userId: string,
  training: { bodyPart: BodyPart; setsPerWeek: number; weeks: number; until: string },
): Promise<string[]> {
  const refusal = devToolRefusal(env);
  if (refusal) throw new Error(refusal);
  const { bodyPart, setsPerWeek, weeks, until } = training;
  if (!(setsPerWeek > 0) || !Number.isInteger(weeks) || weeks < 1)
    throw new Error("sets must be above 0 and weeks a whole number from 1.");
  const last = Date.parse(`${until}T00:00:00Z`);
  if (Number.isNaN(last)) throw new Error("until must be a date (YYYY-MM-DD).");
  const days = Array.from({ length: weeks }, (_, w) =>
    new Date(last - (weeks - 1 - w) * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  await repo.insertDevTraining(
    prisma,
    days.map((earnedOn) => ({ userId, sourceId: randomUUID(), bodyPart, earnedOn, stimulus: setsPerWeek })),
  );
  return days;
}
