import { isUuid } from "../../lib/ids.js";
import { prisma, type Db } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";

// The only file that queries the routine and routine_exercise tables.

const withExercises = { exercises: { orderBy: { order: "asc" } } } satisfies Prisma.RoutineInclude;
export type RoutineRow = Prisma.RoutineGetPayload<{ include: typeof withExercises }>;

export type RoutineData = {
  name: string;
  exercises: { exerciseId: string; targetSets: number; targetReps: number; restSec?: number | null }[];
};

const numbered = (exercises: RoutineData["exercises"]) =>
  exercises.map((e, order) => ({ order, exerciseId: e.exerciseId, targetSets: e.targetSets, targetReps: e.targetReps, restSec: e.restSec ?? null }));

export function findRoutinesForUser(userId: string) {
  return prisma.routine.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" }, // the order the player made them: "Push, Pull, Legs"
    select: { id: true, name: true, lastDoneAt: true, updatedAt: true, _count: { select: { exercises: true } } },
  });
}

/** The owner is in the WHERE clause: someone else's routine is simply "not found". */
export function findRoutineForUser(userId: string, id: string): Promise<RoutineRow | null> {
  if (!isUuid(id)) return Promise.resolve(null);
  return prisma.routine.findFirst({ where: { id, userId }, include: withExercises });
}

export function insertRoutine(userId: string, data: RoutineData): Promise<RoutineRow> {
  return prisma.routine.create({
    data: { userId, name: data.name, exercises: { create: numbered(data.exercises) } },
    include: withExercises,
  });
}

/** Replaces the name and ALL exercises in one transaction. null = not this user's routine. */
export async function replaceRoutine(userId: string, id: string, data: RoutineData): Promise<RoutineRow | null> {
  if (!isUuid(id)) return null;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.routine.updateMany({ where: { id, userId }, data: { name: data.name } });
    if (count === 0) return null;
    await tx.routineExercise.deleteMany({ where: { routineId: id } });
    await tx.routineExercise.createMany({ data: numbered(data.exercises).map((e) => ({ ...e, routineId: id })) });
    return tx.routine.findUniqueOrThrow({ where: { id }, include: withExercises });
  });
}

/** Returns false when there was nothing of this user's to delete. */
export async function deleteRoutine(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const { count } = await prisma.routine.deleteMany({ where: { id, userId } });
  return count > 0;
}

export async function routineBelongsTo(db: Db, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await db.routine.count({ where: { id, userId } })) > 0;
}

/**
 * Moves lastDoneAt forward to `startedAt`, never backwards: a workout synced late from
 * flight mode may be older than one already recorded. One atomic UPDATE.
 */
export async function recordDone(db: Db, id: string, startedAt: Date): Promise<void> {
  await db.routine.updateMany({
    where: { id, OR: [{ lastDoneAt: null }, { lastDoneAt: { lt: startedAt } }] },
    data: { lastDoneAt: startedAt },
  });
}
