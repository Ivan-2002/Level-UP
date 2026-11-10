import { z } from "zod";
import type {
  Exercise,
  FinishWorkoutInput,
  ListWorkoutsQuery,
  WorkoutDetail,
  WorkoutPage,
} from "@levelup/shared";
import { AppError } from "../../lib/errors.js";
import * as exercisesService from "../exercises/exercises.service.js";
import * as repo from "./workouts.repository.js";

// Business rules for logged workouts:
// - "Finish" is idempotent per (user, clientId): a retry returns the saved workout and
//   creates nothing. The FIRST version saved wins; a retry's payload is not compared.
// - Only exercises this user may use can be logged.
// - A user only ever sees their own workouts.
// No XP here: Milestone 5 adds it to finishWorkout, in the same transaction.

export type FinishResult = { workout: WorkoutDetail; created: boolean };

export async function finishWorkout(userId: string, input: FinishWorkoutInput): Promise<FinishResult> {
  // 1. A repeat (e.g. the response was lost on bad signal): return what we already have.
  const existing = await repo.findByClientId(userId, input.clientId);
  if (existing) return { workout: await toDetail(userId, existing), created: false };

  // 2. Every exercise must exist and be usable by this user. Asked through the exercises
  //    module's service: modules never read each other's tables.
  const ids = input.exercises.map((e) => e.exerciseId);
  const exercises = await exercisesService.findUsableExercises(userId, ids);
  const unknown = [...new Set(ids)].filter((id) => !exercises.has(id));
  if (unknown.length > 0) {
    throw new AppError("invalid", "UnknownExercise", `Unknown exercise: ${unknown.join(", ")}`);
  }

  // 3. Save. If a concurrent identical request won the race between step 1 and here,
  //    the unique index stops a second copy and we return the winner's workout.
  const saved = await repo.insertWorkout({
    userId,
    clientId: input.clientId,
    name: input.name,
    startedAt: new Date(input.startedAt),
    finishedAt: new Date(input.finishedAt),
    exercises: input.exercises,
  });
  if (saved === "duplicate") {
    const winner = await repo.findByClientId(userId, input.clientId);
    if (!winner) throw new Error("Unique clientId conflict, but no workout found");
    return { workout: await toDetail(userId, winner), created: false };
  }
  return { workout: buildDetail(saved, exercises), created: true };
}

export async function getWorkout(userId: string, workoutId: string): Promise<WorkoutDetail> {
  const row = await repo.findByIdForUser(userId, workoutId);
  // Same answer for "doesn't exist" and "belongs to someone else": never confirm that
  // another user's workout id is real.
  if (!row) throw new AppError("not_found", "WorkoutNotFound", "Workout not found.");
  return toDetail(userId, row);
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

async function toDetail(userId: string, row: repo.WorkoutDetailRow): Promise<WorkoutDetail> {
  const exercises = await exercisesService.findUsableExercises(
    userId,
    row.exercises.map((e) => e.exerciseId),
  );
  return buildDetail(row, exercises);
}

function buildDetail(row: repo.WorkoutDetailRow, exercises: Map<string, Exercise>): WorkoutDetail {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt.toISOString(),
    exercises: row.exercises.map((we) => {
      const exercise = exercises.get(we.exerciseId);
      // Can't happen today: the FK plus onDelete: Restrict keep every logged exercise.
      if (!exercise) throw new Error(`Exercise ${we.exerciseId} of workout ${row.id} not found`);
      return {
        id: we.id,
        order: we.order,
        exercise,
        sets: we.sets.map((set) => ({
          id: set.id,
          setOrder: set.setOrder,
          reps: set.reps,
          weightKg: set.weightKg.toNumber(), // Postgres DECIMAL -> plain number
        })),
      };
    }),
  };
}
