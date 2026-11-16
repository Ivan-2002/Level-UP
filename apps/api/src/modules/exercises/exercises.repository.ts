import { prisma, type Db } from "../../lib/prisma.js";
import type { BodyPart, Equipment, Mechanic, Prisma, RepsUnit } from "../../generated/prisma/client.js";
import type { CatalogExercise } from "./exercise-catalog.js";

// The only file that queries the exercise and exercise_preference tables. Other modules
// never read them directly; they call exercises.service (see "modular monolith").

/** An exercise row plus THIS user's preference (at most one, thanks to the composite key). */
const withPreferenceOf = (userId: string) =>
  ({ preferences: { where: { userId }, select: { restSec: true } } }) satisfies Prisma.ExerciseInclude;

export type ExerciseRow = Prisma.ExerciseGetPayload<{ include: ReturnType<typeof withPreferenceOf> }>;

/** Built-in exercises plus this user's own custom ones. */
const usableBy = (userId: string): Prisma.ExerciseWhereInput => ({ OR: [{ ownerId: null }, { ownerId: userId }] });

export function findUsableExercises(
  userId: string,
  filter: { searchTerms?: string[]; bodyPart?: BodyPart } = {},
): Promise<ExerciseRow[]> {
  return prisma.exercise.findMany({
    where: {
      AND: [
        usableBy(userId),
        ...(filter.bodyPart ? [{ bodyPart: filter.bodyPart }] : []),
        // Every word must appear in the name OR the muscle group (ILIKE: ignores case).
        ...(filter.searchTerms ?? []).map((term) => ({
          OR: [
            { name: { contains: term, mode: "insensitive" as const } },
            { muscleGroup: { contains: term, mode: "insensitive" as const } },
          ],
        })),
      ],
    },
    include: withPreferenceOf(userId),
    orderBy: [{ bodyPart: "asc" }, { name: "asc" }],
  });
}

export function findUsableExercisesByIds(userId: string, ids: string[], db: Db = prisma): Promise<ExerciseRow[]> {
  return db.exercise.findMany({ where: { AND: [{ id: { in: ids } }, usableBy(userId)] }, include: withPreferenceOf(userId) });
}

export type NewCustomExercise = {
  ownerId: string;
  name: string;
  muscleGroup: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  mechanic: Mechanic;
  repsUnit: RepsUnit;
  loadFactor: number;
  bodyweightRatio: number;
  suggestedRestSec: number;
};

export function insertCustomExercise(data: NewCustomExercise): Promise<ExerciseRow> {
  return prisma.exercise.create({ data: { ...data, isCustom: true }, include: withPreferenceOf(data.ownerId) });
}

/** Saves the player's rest choices (one row per exercise; later choices replace earlier ones). */
export async function upsertRestPreferences(
  db: Db,
  userId: string,
  preferences: { exerciseId: string; restSec: number }[],
): Promise<void> {
  for (const { exerciseId, restSec } of preferences) {
    await db.exercisePreference.upsert({
      where: { userId_exerciseId: { userId, exerciseId } },
      create: { userId, exerciseId, restSec },
      update: { restSec },
    });
  }
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
