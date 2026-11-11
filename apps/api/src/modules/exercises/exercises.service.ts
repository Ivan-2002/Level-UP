import type { CreateExerciseInput, Exercise, ListExercisesQuery } from "@levelup/shared";
import type { Db } from "../../lib/prisma.js";
import * as repo from "./exercises.repository.js";

// The exercises module's public API. Other modules (workouts, routines) call these
// functions instead of querying the exercise tables, so this module stays free to change
// its storage.

export async function listExercises(userId: string, query: ListExercisesQuery = {}): Promise<Exercise[]> {
  const searchTerms = query.search?.split(/\s+/).filter(Boolean);
  const rows = await repo.findUsableExercises(userId, { searchTerms, bodyPart: query.bodyPart });
  return rows.map(toExercise);
}

/**
 * The exercises among `ids` that this user may log, keyed by id. An id missing from the
 * result doesn't exist, or is someone else's custom exercise.
 * Pass `db` to read inside a transaction another module started.
 */
export async function findUsableExercises(userId: string, ids: string[], db?: Db): Promise<Map<string, Exercise>> {
  const rows = await repo.findUsableExercisesByIds(userId, [...new Set(ids)], db);
  return new Map(rows.map((row) => [row.id, toExercise(row)]));
}

// Custom exercises get CONSERVATIVE XP tuning, chosen by the server (never the client):
// loadFactor 1.0 is the back-squat benchmark, so a light isolation lift made "custom"
// earns less than its built-in version and can't be used to farm XP. Bodyweight custom
// exercises count 60% of bodyweight (between a push-up and a pull-up) so they still earn.
const CUSTOM_LOAD_FACTOR = 1.0;
const CUSTOM_BODYWEIGHT_RATIO = 0.6;
const CUSTOM_REST_SEC = { compound: 150, isolation: 75 } as const;

export async function createCustomExercise(userId: string, input: CreateExerciseInput): Promise<Exercise> {
  const row = await repo.insertCustomExercise({
    ownerId: userId,
    ...input,
    loadFactor: CUSTOM_LOAD_FACTOR,
    bodyweightRatio: input.equipment === "bodyweight" ? CUSTOM_BODYWEIGHT_RATIO : 0,
    suggestedRestSec: CUSTOM_REST_SEC[input.mechanic],
  });
  return toExercise(row);
}

/** Remembers the rest times the player chose (written at Finish, inside its transaction). */
export function saveRestPreferences(db: Db, userId: string, preferences: { exerciseId: string; restSec: number }[]) {
  return repo.upsertRestPreferences(db, userId, preferences);
}

function toExercise(row: repo.ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    bodyPart: row.bodyPart,
    equipment: row.equipment,
    repsUnit: row.repsUnit,
    mechanic: row.mechanic,
    suggestedRestSec: row.suggestedRestSec,
    loadFactor: row.loadFactor.toNumber(), // Postgres DECIMAL -> plain number
    bodyweightRatio: row.bodyweightRatio.toNumber(),
    isCustom: row.isCustom,
    restPreferenceSec: row.preferences[0]?.restSec ?? null,
  };
}
