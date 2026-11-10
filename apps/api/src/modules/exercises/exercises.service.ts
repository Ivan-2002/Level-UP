import type { Exercise } from "@levelup/shared";
import * as repo from "./exercises.repository.js";

// The exercises module's public API. Other modules (workouts) call these functions
// instead of querying the exercise table, so this module stays free to change its storage.

export async function listExercises(userId: string): Promise<Exercise[]> {
  const rows = await repo.findUsableExercises(userId);
  return rows.map(toExercise);
}

/**
 * The exercises among `ids` that this user may log, keyed by id. An id that is missing
 * from the result doesn't exist, or belongs to someone else's custom exercise.
 */
export async function findUsableExercises(userId: string, ids: string[]): Promise<Map<string, Exercise>> {
  const rows = await repo.findUsableExercisesByIds(userId, [...new Set(ids)]);
  return new Map(rows.map((row) => [row.id, toExercise(row)]));
}

// loadFactor and bodyweightRatio are deliberately left out: they are XP rules, and
// the server owns the rules. Keeping them private lets us retune without an API change.
function toExercise(row: repo.ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscleGroup,
    bodyPart: row.bodyPart,
    equipment: row.equipment,
  };
}
