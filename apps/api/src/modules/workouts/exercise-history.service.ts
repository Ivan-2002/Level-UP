import {
  bodyweightOnDate,
  BODYWEIGHT_FALLBACK_KG,
  canBeRecord,
  estimatedOneRepMax,
  exerciseStats,
  liftedKg,
  volumeKg,
  type Exercise,
  type ExerciseSession,
  type ExerciseSummary,
  type ExerciseXpHistoryList,
  type LastSessionList,
  type RecentExerciseList,
} from "@levelup/shared";
import { now } from "../../lib/clock.js";
import { AppError } from "../../lib/errors.js";
import { isUuid } from "../../lib/ids.js";
import type { Db } from "../../lib/prisma.js";
import * as exercisesService from "../exercises/exercises.service.js";
import * as progressionService from "../progression/progression.service.js";
import * as usersService from "../users/users.service.js";
import * as repo from "./workouts.repository.js";

// Exercise history, built from logged workouts. It lives in the workouts module (not
// exercises) because workout history is this module's data: putting it in exercises would
// make exercises depend on workouts, while workouts already depends on exercises.
// Records are calculated on read (decision log), with the shared pure functions.

const RECENT_LIMIT = 10;

export async function exerciseSummary(userId: string, exerciseId: string, sessionLimit: number): Promise<ExerciseSummary> {
  const exercise = await usableExerciseOrThrow(userId, exerciseId);
  const [history, bodyweights] = await Promise.all([
    repo.findExerciseHistory(userId, [exerciseId]),
    usersService.bodyweightHistory(userId),
  ]);

  // One session per workout, oldest first (an exercise done twice in one workout merges).
  const byWorkout = new Map<string, repo.ExerciseHistoryRow[]>();
  for (const row of history) byWorkout.set(row.workout.id, [...(byWorkout.get(row.workout.id) ?? []), row]);
  const groups = [...byWorkout.values()];
  const sessions = groups.map((rows) => toSession(rows, exercise, bodyweightOnDate(bodyweights, rows[0]!.workout.startedAt.toISOString())));

  // Records leave out jump-capped sets (the session list still shows every set done).
  const stats = exerciseStats(
    groups.map((rows, i) => {
      const { startedAt, bodyweightKg } = sessions[i]!;
      const sets = rows.flatMap((r) => r.sets.filter(canBeRecord)).map((set) => ({ reps: set.reps, weightKg: set.weightKg.toNumber() }));
      return { date: startedAt, sets: sets.map((set) => ({ ...set, loadKg: liftedKg(set.weightKg, bodyweightKg, exercise.bodyweightRatio) })) };
    }),
  );

  const newestFirst = [...sessions].reverse();
  return {
    exercise,
    bodyweightKg: bodyweights.at(-1)?.kg ?? BODYWEIGHT_FALLBACK_KG,
    previousSession: newestFirst[0] ?? null,
    records: {
      bestE1rm: stats.bestE1rm && { value: stats.bestE1rm.e1rm, reps: stats.bestE1rm.reps, weightKg: stats.bestE1rm.weightKg, date: stats.bestE1rm.date },
      heaviestSet: stats.heaviestSet && {
        reps: stats.heaviestSet.reps,
        weightKg: stats.heaviestSet.weightKg,
        loadKg: stats.heaviestSet.loadKg,
        date: stats.heaviestSet.date,
      },
      bestSessionVolume: exercise.repsUnit === "seconds" ? null : stats.bestSessionVolume,
      mostReps: stats.mostReps && { reps: stats.mostReps.reps, weightKg: stats.mostReps.weightKg, date: stats.mostReps.date },
    },
    sessions: newestFirst.slice(0, sessionLimit),
  };
}

/**
 * Each exercise's most recent session, in one request (routine detail would otherwise
 * need one request per exercise). Exercises never done, or not usable by this player,
 * are left out.
 */
export async function lastSessions(userId: string, exerciseIds: string[]): Promise<LastSessionList> {
  const [exercises, history, bodyweights] = await Promise.all([
    exercisesService.findUsableExercises(userId, exerciseIds),
    repo.findExerciseHistory(userId, exerciseIds),
    usersService.bodyweightHistory(userId),
  ]);

  // History is oldest first: the last workout seen per exercise is the newest. An
  // exercise done twice in that workout merges into one session.
  const latest = new Map<string, repo.ExerciseHistoryRow[]>();
  for (const row of history) {
    const rows = latest.get(row.exerciseId);
    latest.set(row.exerciseId, rows && rows[0]!.workout.id === row.workout.id ? [...rows, row] : [row]);
  }

  return {
    items: exerciseIds.flatMap((exerciseId) => {
      const rows = latest.get(exerciseId);
      const exercise = exercises.get(exerciseId);
      if (!rows || !exercise) return [];
      const bodyweightKg = bodyweightOnDate(bodyweights, rows[0]!.workout.startedAt.toISOString());
      return [{ exerciseId, session: toSession(rows, exercise, bodyweightKg) }];
    }),
  };
}

/** The player's last few distinct exercises, newest first, with that session's sets. */
export async function recentExercises(userId: string): Promise<RecentExerciseList> {
  // Over-fetch appearances, then keep each exercise's newest one.
  const appearances = await repo.findRecentExerciseUse(userId, RECENT_LIMIT * 10);
  const newest = new Map<string, repo.ExerciseHistoryRow>();
  for (const row of appearances) if (!newest.has(row.exerciseId)) newest.set(row.exerciseId, row);
  const picked = [...newest.values()].slice(0, RECENT_LIMIT);

  const exercises = await exercisesService.findUsableExercises(userId, picked.map((r) => r.exerciseId));
  return {
    items: picked.flatMap((row) => {
      const exercise = exercises.get(row.exerciseId);
      if (!exercise) return [];
      return [
        {
          exercise,
          lastDoneAt: row.workout.startedAt.toISOString(),
          lastSets: row.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg.toNumber() })),
        },
      ];
    }),
  };
}

/**
 * Each exercise's past sessions, oldest first: of these exercises (null: every exercise),
 * in workouts that started before `before` (omitted: all of them). An exercise done twice
 * in one workout (a superset) is ONE session, as in scoring. Pass `db` inside a transaction.
 */
export async function pastSessions(
  userId: string,
  exerciseIds: string[] | null,
  before?: Date,
  db?: Db,
): Promise<Map<string, progressionService.PastSession[]>> {
  const rows = await repo.findExerciseHistory(userId, exerciseIds, before && { startedAt: before }, db);
  const sessions = new Map<string, Map<string, progressionService.PastSession>>();
  for (const row of rows) {
    const byWorkout = sessions.get(row.exerciseId) ?? new Map<string, progressionService.PastSession>();
    const session = byWorkout.get(row.workout.id) ?? { startedAt: row.workout.startedAt, sets: [] };
    session.sets.push(...row.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg.toNumber() })));
    byWorkout.set(row.workout.id, session);
    sessions.set(row.exerciseId, byWorkout);
  }
  return new Map([...sessions].map(([exerciseId, byWorkout]) => [exerciseId, [...byWorkout.values()]]));
}

/**
 * GET /exercises/xp-history: every exercise the player has done, with the history the
 * shared scoring needs, as of now. Replays the player's whole history (see the
 * performance test in exercise-xp-history.test.ts).
 */
export async function exerciseXpHistories(userId: string): Promise<ExerciseXpHistoryList> {
  const sessions = await pastSessions(userId, null);
  const exercises = await exercisesService.findUsableExercises(userId, [...sessions.keys()]);
  const histories = await progressionService.xpHistories(userId, sessions, exercises, now());
  return { items: [...histories].map(([exerciseId, history]) => ({ exerciseId, ...history })) };
}

async function usableExerciseOrThrow(userId: string, exerciseId: string): Promise<Exercise> {
  const exercise = isUuid(exerciseId) ? (await exercisesService.findUsableExercises(userId, [exerciseId])).get(exerciseId) : undefined;
  if (!exercise) throw new AppError("not_found", "ExerciseNotFound", "Exercise not found.");
  return exercise;
}

function toSession(rows: repo.ExerciseHistoryRow[], exercise: Exercise, bodyweightKg: number): ExerciseSession {
  const sets = rows.flatMap((r) => r.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg.toNumber() })));
  const loads = sets.map((s) => ({ ...s, loadKg: liftedKg(s.weightKg, bodyweightKg, exercise.bodyweightRatio) }));
  const e1rms = loads.map((s) => estimatedOneRepMax(s.loadKg, s.reps)).filter((v): v is number => v !== null);
  const top = loads.reduce<(typeof loads)[number] | null>(
    (best, s) => (!best || s.loadKg > best.loadKg || (s.loadKg === best.loadKg && s.reps > best.reps) ? s : best),
    null,
  );
  return {
    workoutId: rows[0]!.workout.id,
    startedAt: rows[0]!.workout.startedAt.toISOString(),
    bodyweightKg,
    sets,
    bestE1rm: exercise.repsUnit === "seconds" || e1rms.length === 0 ? null : Math.max(...e1rms),
    volumeKg: exercise.repsUnit === "seconds" ? 0 : volumeKg(loads),
    topSet: top && { reps: top.reps, weightKg: top.weightKg },
  };
}
