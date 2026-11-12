import { z } from "zod";
import {
  addToRecordBook,
  bodyweightOnDate,
  emptyRecordBook,
  findNewRecords,
  levelFromXp,
  liftedKg,
  setXp,
  volumeKg,
  type Exercise,
  type FinishSummary,
  type FinishWorkoutInput,
  type FinishWorkoutResponse,
  type ListWorkoutsQuery,
  type RecordBook,
  type WorkoutDetail,
  type WorkoutPage,
} from "@levelup/shared";
import { now } from "../../lib/clock.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import * as exercisesService from "../exercises/exercises.service.js";
import * as progressionService from "../progression/progression.service.js";
import * as weeklyGoalService from "../progression/weekly-goal.service.js";
import * as routinesService from "../routines/routines.service.js";
import * as usersService from "../users/users.service.js";
import * as repo from "./workouts.repository.js";
import { daysTrainedAsOf, daysTrainedFor } from "./weekly-goal.service.js";

// Business rules for logged workouts:
// - "Finish" is idempotent per (user, clientId): a retry returns the saved workout and
//   creates nothing. The FIRST version saved wins; a retry's payload is not compared.
// - Finish saves the workout, its XP, the weekly goal (and any bonus it earned), rest
//   preferences and the routine's "last done" in ONE transaction: all of it, or none of it.
// - The summary is calculated from saved data on every read, so a repeat returns the
//   same summary. Records only ever compare with workouts that started earlier.
// - A user only ever sees their own workouts.
// Dependencies: workouts -> exercises, routines, users, progression (never the reverse).

export type FinishResult = FinishWorkoutResponse & { created: boolean };

export async function finishWorkout(userId: string, input: FinishWorkoutInput): Promise<FinishResult> {
  // 1. A repeat (e.g. the response was lost on bad signal): return what we already have.
  const existing = await repo.findByClientId(userId, input.clientId);
  if (existing) return { ...(await present(userId, existing)), created: false };

  // 2. XP needs a character to go to, and every exercise must be usable by this user.
  await usersService.requireProfile(userId);
  const exercises = await usableExercisesOrThrow(userId, input.exercises.map((e) => e.exerciseId));

  // 3. Save everything in one transaction. Every module writes through `tx`.
  try {
    const saved = await prisma.$transaction(async (tx) => {
      // A routine deleted (or never ours) is ignored rather than failing the whole
      // Finish: an offline workout must never become an error the outbox retries forever.
      const routineId =
        input.routineId && (await routinesService.routineBelongsTo(tx, userId, input.routineId)) ? input.routineId : null;
      const startedAt = new Date(input.startedAt);

      const row = await repo.insertWorkout(tx, {
        userId,
        clientId: input.clientId,
        name: input.name,
        routineId,
        startedAt,
        finishedAt: new Date(input.finishedAt),
        exercises: input.exercises,
      });

      const bodyweightKg = bodyweightOnDate(await usersService.bodyweightHistory(userId, tx), input.startedAt);
      await progressionService.awardSetXp(tx, userId, setXpAwards(row, exercises, bodyweightKg));
      // Rolls the weeks over and, if this workout meets this week's goal, pays the bonus.
      await weeklyGoalService.syncWeeklyGoal(tx, userId, { now: now(), daysTrainedIn: daysTrainedFor(tx, userId), metByWorkoutId: row.id });
      await exercisesService.saveRestPreferences(tx, userId, chosenRestTimes(input));
      if (routineId) await routinesService.recordRoutineDone(tx, routineId, startedAt);
      return row;
    });
    return { ...(await present(userId, saved, exercises)), created: true };
  } catch (err) {
    // A concurrent identical request won the race; the whole transaction rolled back.
    if (!repo.isDuplicateWorkout(err)) throw err;
    const winner = await repo.findByClientId(userId, input.clientId);
    if (!winner) throw new Error("Unique clientId conflict, but no workout found");
    return { ...(await present(userId, winner)), created: false };
  }
}

export async function getWorkout(userId: string, workoutId: string): Promise<WorkoutDetail> {
  return (await detailOf(userId, await findOwnWorkout(userId, workoutId))).workout;
}

export async function getWorkoutSummary(userId: string, workoutId: string): Promise<FinishWorkoutResponse> {
  return present(userId, await findOwnWorkout(userId, workoutId));
}

export async function listWorkouts(userId: string, query: ListWorkoutsQuery): Promise<WorkoutPage> {
  const after = query.cursor === undefined ? undefined : decodeCursor(query.cursor);

  // Ask for one extra row: if it comes back, there is a next page.
  const rows = await repo.findHistoryPage(userId, query.limit + 1, after);
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);

  return {
    items: page.map((row) => ({
      id: row.id,
      name: row.name,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt.toISOString(),
      exerciseCount: row.exercises.length,
      setCount: row.exercises.reduce((sum, e) => sum + e._count.sets, 0),
    })),
    nextCursor: hasMore && last ? encodeCursor({ startedAt: last.startedAt, id: last.id }) : null,
  };
}

// --- Finish helpers --------------------------------------------------------------

async function findOwnWorkout(userId: string, workoutId: string): Promise<repo.WorkoutDetailRow> {
  const row = await repo.findByIdForUser(userId, workoutId);
  // Same answer for "doesn't exist" and "belongs to someone else": never confirm that
  // another user's workout id is real.
  if (!row) throw new AppError("not_found", "WorkoutNotFound", "Workout not found.");
  return row;
}

async function usableExercisesOrThrow(userId: string, ids: string[]): Promise<Map<string, Exercise>> {
  const exercises = await exercisesService.findUsableExercises(userId, ids);
  const unknown = [...new Set(ids)].filter((id) => !exercises.has(id));
  if (unknown.length > 0) throw new AppError("invalid", "UnknownExercise", `Unknown exercise: ${unknown.join(", ")}`);
  return exercises;
}

/** XP for every completed, non-flagged set, using the shared formula. */
function setXpAwards(row: repo.WorkoutDetailRow, exercises: Map<string, Exercise>, bodyweightKg: number) {
  return row.exercises.flatMap((we) => {
    const exercise = exerciseOf(exercises, we.exerciseId);
    return we.sets
      .filter((s) => !s.isFlagged)
      .map((s) => ({
        setId: s.id,
        bodyPart: exercise.bodyPart,
        amount: setXp({ reps: s.reps, weightKg: s.weightKg.toNumber() }, bodyweightKg, exercise),
      }));
  });
}

/** Rest times the PLAYER chose. If an exercise appears twice, the later choice wins. */
function chosenRestTimes(input: FinishWorkoutInput) {
  const chosen = new Map<string, number>();
  for (const e of input.exercises) {
    if (e.saveRestAsPreference && e.restSec !== undefined) chosen.set(e.exerciseId, e.restSec);
  }
  return [...chosen].map(([exerciseId, restSec]) => ({ exerciseId, restSec }));
}

// --- Presenting a workout: detail + summary ------------------------------------------

/** The workout in the API shape, plus the exercises it used (loaded unless already known). */
async function detailOf(userId: string, row: repo.WorkoutDetailRow, knownExercises?: Map<string, Exercise>) {
  const exercises = knownExercises ?? (await exercisesService.findUsableExercises(userId, row.exercises.map((e) => e.exerciseId)));
  return { workout: buildDetail(row, exercises), exercises };
}

/** Detail + summary: what Finish (new or repeated) and GET /workouts/:id/summary return. */
async function present(userId: string, row: repo.WorkoutDetailRow, knownExercises?: Map<string, Exercise>): Promise<FinishWorkoutResponse> {
  const { workout, exercises } = await detailOf(userId, row, knownExercises);
  return { workout, summary: await buildSummary(userId, row, exercises) };
}

async function buildSummary(userId: string, row: repo.WorkoutDetailRow, exercises: Map<string, Exercise>): Promise<FinishSummary> {
  const bodyweights = await usersService.bodyweightHistory(userId);
  const bodyweightOn = (date: Date) => bodyweightOnDate(bodyweights, date.toISOString());
  const bodyweightKg = bodyweightOn(row.startedAt);

  // XP: what the ledger recorded for these sets, and the total just before.
  const setIds = row.exercises.flatMap((e) => e.sets.map((s) => s.id));
  const { earned, totalBefore } = await progressionService.workoutXp(userId, setIds, row.createdAt);
  const bonus = await weeklyGoalService.bonusXpOf(row.id);
  const total = earned + bonus.weeklyGoal + bonus.streakMilestone;

  // Compared with last time (same routine, or the previous workout).
  const previous = await repo.findPreviousWorkout(userId, row);
  const previousExercises = previous
    ? await exercisesService.findUsableExercises(userId, previous.exercises.map((e) => e.exerciseId))
    : null;

  return {
    xp: { sets: earned, ...bonus, total },
    level: {
      before: levelFromXp(totalBefore),
      after: levelFromXp(totalBefore + total),
      totalXpBefore: totalBefore,
      totalXpAfter: totalBefore + total,
    },
    stats: {
      ...sessionStats(row, exercises, bodyweightKg),
      previous: previous && previousExercises ? sessionStats(previous, previousExercises, bodyweightOn(previous.startedAt)) : null,
    },
    weeklyGoal: await weeklyGoalService.weekStatusAsOf(userId, row.startedAt, daysTrainedAsOf(userId, row.createdAt)),
    prs: await personalRecords(userId, row, exercises, bodyweightKg, bodyweightOn),
    bodyweightKg,
  };
}

function sessionStats(row: repo.WorkoutDetailRow, exercises: Map<string, Exercise>, bodyweightKg: number) {
  const loaded = row.exercises.flatMap((we) => {
    const exercise = exerciseOf(exercises, we.exerciseId);
    if (exercise.repsUnit === "seconds") return []; // seconds x kg isn't volume
    return we.sets.map((s) => ({ reps: s.reps, loadKg: liftedKg(s.weightKg.toNumber(), bodyweightKg, exercise.bodyweightRatio) }));
  });
  return {
    durationSec: Math.round((row.finishedAt.getTime() - row.startedAt.getTime()) / 1000),
    setCount: row.exercises.reduce((sum, e) => sum + e.sets.length, 0),
    volumeKg: volumeKg(loaded),
  };
}

/**
 * New PRs in this workout, one line per exercise and kind: the best new value against
 * the best from BEFORE this workout (so "76 -> 78 kg" even if two sets beat it).
 */
async function personalRecords(
  userId: string,
  row: repo.WorkoutDetailRow,
  exercises: Map<string, Exercise>,
  bodyweightKg: number,
  bodyweightOn: (date: Date) => number,
): Promise<FinishSummary["prs"]> {
  const exerciseIds = [...new Set(row.exercises.map((e) => e.exerciseId))];
  const history = await repo.findExerciseHistory(userId, exerciseIds, row);

  const books = new Map<string, RecordBook>();
  for (const past of history) {
    const exercise = exerciseOf(exercises, past.exerciseId);
    const bw = bodyweightOn(past.workout.startedAt);
    const sets = past.sets.map((s) => ({ reps: s.reps, loadKg: liftedKg(s.weightKg.toNumber(), bw, exercise.bodyweightRatio) }));
    books.set(past.exerciseId, addToRecordBook(books.get(past.exerciseId) ?? emptyRecordBook(), sets, exercise.repsUnit));
  }

  const prs: FinishSummary["prs"] = [];
  for (const exerciseId of exerciseIds) {
    const exercise = exerciseOf(exercises, exerciseId);
    const sets = row.exercises
      .filter((we) => we.exerciseId === exerciseId)
      .flatMap((we) => we.sets.filter((s) => !s.isFlagged))
      .map((s) => ({ reps: s.reps, loadKg: liftedKg(s.weightKg.toNumber(), bodyweightKg, exercise.bodyweightRatio) }));
    const records = findNewRecords(books.get(exerciseId) ?? emptyRecordBook(), sets, exercise.repsUnit);

    for (const kind of new Set(records.map((r) => r.kind))) {
      const ofKind = records.filter((r) => r.kind === kind);
      const best = ofKind.reduce((a, b) => (b.value > a.value ? b : a));
      // e1RM and holds improve step by step within a session: compare with the
      // pre-workout best. "Reps at weight" compares at the best set's own weight.
      const previousValue = kind === "reps_at_weight" ? best.previousValue : Math.min(...ofKind.map((r) => r.previousValue));
      prs.push({ exerciseId, exerciseName: exercise.name, kind, value: best.value, previousValue });
    }
  }
  return prs;
}

function exerciseOf(exercises: Map<string, Exercise>, id: string): Exercise {
  const exercise = exercises.get(id);
  // Can't happen today: workout_exercise -> exercise is ON DELETE RESTRICT.
  if (!exercise) throw new Error(`Exercise ${id} not found`);
  return exercise;
}

// --- Cursor: opaque to the app ------------------------------------------------
// base64url(JSON) of the last row's sort key. "Opaque" means the app just passes it back;
// we can change what's inside later without breaking anyone.

const cursorSchema = z.object({ s: z.iso.datetime(), id: z.uuid() });

function encodeCursor(position: repo.HistoryPosition): string {
  return Buffer.from(JSON.stringify({ s: position.startedAt.toISOString(), id: position.id })).toString("base64url");
}

function decodeCursor(cursor: string): repo.HistoryPosition {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    return { startedAt: new Date(parsed.s), id: parsed.id };
  } catch {
    throw new AppError("invalid", "InvalidCursor", "That page cursor isn't valid. Start again from the first page.");
  }
}

// --- Row -> API contract ------------------------------------------------------

function buildDetail(row: repo.WorkoutDetailRow, exercises: Map<string, Exercise>): WorkoutDetail {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    routineId: row.routineId,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    exercises: row.exercises.map((we) => ({
      id: we.id,
      order: we.order,
      exercise: exerciseOf(exercises, we.exerciseId),
      restSec: we.restSec,
      sets: we.sets.map((set) => ({
        id: set.id,
        setOrder: set.setOrder,
        completedAt: set.completedAt?.toISOString() ?? null,
        reps: set.reps,
        weightKg: set.weightKg.toNumber(), // Postgres DECIMAL -> plain number
      })),
    })),
  };
}
