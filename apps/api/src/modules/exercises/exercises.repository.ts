import { prisma } from "../../lib/prisma.js";
import type { Exercise as ExerciseRow } from "../../generated/prisma/client.js";
import type { CatalogExercise } from "./exercise-catalog.js";

// The only file that queries the exercise table. Other modules never read it directly;
// they call exercises.service (see docs/ARCHITECTURE.md, "modular monolith").

export type { ExerciseRow };

/** Built-in exercises plus this user's own custom ones (none exist yet). */
const usableBy = (userId: string) => ({ OR: [{ ownerId: null }, { ownerId: userId }] });

export function findUsableExercises(userId: string): Promise<ExerciseRow[]> {
  return prisma.exercise.findMany({
    where: usableBy(userId),
    orderBy: [{ bodyPart: "asc" }, { name: "asc" }],
  });
}

export function findUsableExercisesByIds(userId: string, ids: string[]): Promise<ExerciseRow[]> {
  return prisma.exercise.findMany({ where: { id: { in: ids }, ...usableBy(userId) } });
}

/**
 * Inserts or updates every catalog exercise by its slug, in one transaction.
 * Re-running it is safe: existing rows keep their id (so logged workouts stay linked)
 * and pick up any retuned values.
 */
export async function upsertCatalog(entries: CatalogExercise[]): Promise<void> {
  await prisma.$transaction(
    entries.map(({ slug, repsUnit = "reps", ...rest }) => {
      // Always written, so removing repsUnit from a catalog entry resets it to "reps".
      const fields = { ...rest, repsUnit };
      return prisma.exercise.upsert({
        where: { slug },
        create: { slug, ...fields },
        update: fields,
      });
    }),
  );
}
