import type { Exercise, Routine, RoutineInput, RoutineSummary } from "@levelup/shared";
import { AppError } from "../../lib/errors.js";
import type { Db } from "../../lib/prisma.js";
import * as exercisesService from "../exercises/exercises.service.js";
import * as repo from "./routines.repository.js";

// Business rules for routines (saved plans):
// - a player only ever sees and changes their own routines;
// - every exercise must be one they can use (built-in or their own custom);
// - deleting a routine never deletes history (workouts keep their own copy).
// Dependencies go ONE way: workouts -> routines (recordDone at Finish). This module never
// reads workouts, which is why "last done" is a cached column instead of a query.

const notFound = () => new AppError("not_found", "RoutineNotFound", "Routine not found.");

export async function listRoutines(userId: string): Promise<RoutineSummary[]> {
  const rows = await repo.findRoutinesForUser(userId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    exerciseCount: r._count.exercises,
    lastDoneAt: r.lastDoneAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getRoutine(userId: string, id: string): Promise<Routine> {
  const row = await repo.findRoutineForUser(userId, id);
  if (!row) throw notFound();
  return toRoutine(userId, row);
}

export async function createRoutine(userId: string, input: RoutineInput): Promise<Routine> {
  const exercises = await usableExercisesOrThrow(userId, input);
  return buildRoutine(await repo.insertRoutine(userId, input), exercises);
}

export async function updateRoutine(userId: string, id: string, input: RoutineInput): Promise<Routine> {
  const exercises = await usableExercisesOrThrow(userId, input);
  const row = await repo.replaceRoutine(userId, id, input);
  if (!row) throw notFound();
  return buildRoutine(row, exercises);
}

export async function deleteRoutine(userId: string, id: string): Promise<void> {
  if (!(await repo.deleteRoutine(userId, id))) throw notFound();
}

// --- Used by the workouts module at Finish (inside its transaction) ---------------

/** False for a routine that was deleted, or belongs to someone else. */
export function routineBelongsTo(db: Db, userId: string, id: string): Promise<boolean> {
  return repo.routineBelongsTo(db, userId, id);
}

export function recordRoutineDone(db: Db, id: string, startedAt: Date): Promise<void> {
  return repo.recordDone(db, id, startedAt);
}

// --- Helpers ---------------------------------------------------------------------

async function usableExercisesOrThrow(userId: string, input: RoutineInput): Promise<Map<string, Exercise>> {
  const ids = input.exercises.map((e) => e.exerciseId);
  const exercises = await exercisesService.findUsableExercises(userId, ids);
  const unknown = [...new Set(ids)].filter((id) => !exercises.has(id));
  if (unknown.length > 0) throw new AppError("invalid", "UnknownExercise", `Unknown exercise: ${unknown.join(", ")}`);
  return exercises;
}

async function toRoutine(userId: string, row: repo.RoutineRow): Promise<Routine> {
  const exercises = await exercisesService.findUsableExercises(userId, row.exercises.map((e) => e.exerciseId));
  return buildRoutine(row, exercises);
}

function buildRoutine(row: repo.RoutineRow, exercises: Map<string, Exercise>): Routine {
  return {
    id: row.id,
    name: row.name,
    lastDoneAt: row.lastDoneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    exercises: row.exercises.map((re) => {
      const exercise = exercises.get(re.exerciseId);
      // Can't happen: routine_exercise -> exercise is ON DELETE RESTRICT.
      if (!exercise) throw new Error(`Exercise ${re.exerciseId} of routine ${row.id} not found`);
      return { id: re.id, order: re.order, exercise, targetSets: re.targetSets, targetReps: re.targetReps, restSec: re.restSec };
    }),
  };
}
