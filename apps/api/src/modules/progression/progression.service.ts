import {
  bodyweightOnDate,
  exerciseXpHistory,
  scoreSessionSets,
  xpBodyweightOnDate,
  type BodyPart,
  type ExerciseXpHistory,
  type ScoredSet,
  type ScoringExercise,
  type SessionSet,
} from "@levelup/shared";
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
  /** Every set of the workout, in the order logged (exercise by exercise). */
  sets: SessionSet[];
  exercises: Map<string, ScoringExercise>;
  /** Per exercise in the workout: its sessions in workouts that started earlier, oldest first. */
  pastSessions: Map<string, PastSession[]>;
};

export type WorkoutScore = {
  /** One per input set, in the same order. */
  sets: ScoredSet[];
  /** The real bodyweight in effect that day (lifted kg, PRs, the summary). */
  bodyweightKg: number;
};

/**
 * Scores a workout's sets with the shared pipeline (plausibility, jump cap, effort, tags,
 * the 10-set limit, set XP), using the XP bodyweight on its start date and the player's
 * history with each exercise. Reads only; Finish stores the result. Pass the Finish
 * transaction as `db`.
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
  return { sets: score.sets, bodyweightKg: typed };
}

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
