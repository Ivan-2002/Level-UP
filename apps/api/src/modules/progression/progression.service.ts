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
  XP_SOURCES_UNDER_DAILY_CAP,
} from "@levelup/shared";
import type { XpHeldBackReason } from "../../generated/prisma/client.js";
import type { Db } from "../../lib/prisma.js";
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
  /** Every set of the workout, in the order logged (exercise by exercise). */
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
  const date = workout.startedAt.toISOString();
  const typed = bodyweightOnDate(bodyweights, date);

  const history = new Map<string, ExerciseXpHistory>();
  for (const [exerciseId, sessions] of workout.pastSessions) {
    const exercise = workout.exercises.get(exerciseId);
    if (!exercise) continue;
    const past = sessions.map((s) => {
      const day = s.startedAt.toISOString();
      return { date: day, bodyweightKg: bodyweightOnDate(bodyweights, day), sets: s.sets };
    });
    history.set(exerciseId, exerciseXpHistory(past, exercise, date));
  }

  const score = scoreSessionSets({
    sets: workout.sets,
    exercises: workout.exercises,
    history,
    bodyweight: { xp: xpBodyweightOnDate(bodyweights, date), typed },
  });
  const setXp = score.sets.map((s) => s.xp);
  const scored = setXp.reduce((a, b) => a + b, 0);

  if (isTooOldForXp(workout.startedAt, workout.receivedAt)) {
    return { sets: score.sets, awardedXp: setXp.map(() => 0), heldBack: heldBack(scored, "too_old"), bodyweightKg: typed };
  }
  const dayXpBefore = await repo.sumXpOnDay(db, userId, workout.earnedOn, XP_SOURCES_UNDER_DAILY_CAP);
  const capped = applyDailyCap(dayXpBefore, setXp);
  return { sets: score.sets, awardedXp: capped.awarded, heldBack: heldBack(capped.heldBack, "daily_cap"), bodyweightKg: typed };
}

// Zero means nothing was held back: no reason (the database's CHECK insists on that).
const heldBack = (amount: number, reason: XpHeldBackReason) => (amount > 0 ? { amount, reason } : null);

export type SetXpAward = { setId: string; amount: number; bodyPart: BodyPart };

/**
 * Records XP for completed sets and adds it to the cached total, inside the caller's
 * transaction (Finish). Zero-XP sets get no ledger row. `earnedOn`: the local day the
 * workout started ("YYYY-MM-DD"), the daily cap's day.
 */
export async function awardSetXp(db: Db, userId: string, awards: SetXpAward[], earnedOn: string): Promise<number> {
  const earning = awards.filter((a) => a.amount > 0);
  await repo.insertSetXpEvents(
    db,
    earning.map((a) => ({ userId, amount: a.amount, sourceId: a.setId, bodyPart: a.bodyPart, earnedOn })),
  );
  const earned = earning.reduce((sum, a) => sum + a.amount, 0);
  if (earned > 0) await usersService.addTotalXp(db, userId, earned);
  return earned;
}

/**
 * What one workout earned, and the player's total just before it: the XP recorded
 * before the workout was saved. Recomputed on every read, so a repeated Finish shows
 * the same numbers.
 */
export async function workoutXp(userId: string, setIds: string[], savedAt: Date): Promise<{ earned: number; totalBefore: number }> {
  const [earned, totalBefore] = await Promise.all([repo.sumSetXp(setIds), repo.sumXpBefore(userId, savedAt)]);
  return { earned, totalBefore };
}
