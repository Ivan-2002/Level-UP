import { isUuid } from "../../lib/ids.js";
import { prisma } from "../../lib/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";

// The only file that queries the workout, workout_exercise and workout_set tables.
// It knows how a workout is stored; the service decides what is allowed.

// A workout with its exercises and sets, each in the order performed.
const withExercisesAndSets = {
  exercises: {
    orderBy: { order: "asc" },
    include: { sets: { orderBy: { setOrder: "asc" } } },
  },
} satisfies Prisma.WorkoutInclude;

export type WorkoutDetailRow = Prisma.WorkoutGetPayload<{ include: typeof withExercisesAndSets }>;

// Just enough for a history row; counts sets without loading them.
const summarySelect = {
  id: true,
  name: true,
  startedAt: true,
  finishedAt: true,
  exercises: { select: { _count: { select: { sets: true } } } },
} satisfies Prisma.WorkoutSelect;

export type WorkoutSummaryRow = Prisma.WorkoutGetPayload<{ select: typeof summarySelect }>;

/** Position in the history list: the last row of the previous page. */
export type HistoryPosition = { startedAt: Date; id: string };

export type NewWorkout = {
  userId: string;
  clientId: string;
  name?: string;
  startedAt: Date;
  finishedAt: Date;
  exercises: { exerciseId: string; sets: { reps: number; weightKg: number }[] }[];
};

export function findByClientId(userId: string, clientId: string): Promise<WorkoutDetailRow | null> {
  return prisma.workout.findUnique({
    where: { userId_clientId: { userId, clientId } },
    include: withExercisesAndSets,
  });
}

/**
 * The owner is part of the WHERE clause, so another user's workout is simply "not found":
 * there is no fetch-then-check step that could ever leak it.
 */
export async function findByIdForUser(userId: string, id: string): Promise<WorkoutDetailRow | null> {
  if (!isUuid(id)) return null;
  return prisma.workout.findFirst({ where: { id, userId }, include: withExercisesAndSets });
}

/**
 * Saves the workout, its exercises and its sets in ONE nested create. Prisma runs nested
 * writes inside a single database transaction: either every row is saved, or none is.
 * Order numbers come from array positions, so they are always 0, 1, 2... with no gaps.
 *
 * Returns "duplicate" when (userId, clientId) already exists: a concurrent retry of the
 * same Finish got there first. The service then returns that workout instead.
 */
export async function insertWorkout(data: NewWorkout): Promise<WorkoutDetailRow | "duplicate"> {
  try {
    return await prisma.workout.create({
      data: {
        userId: data.userId,
        clientId: data.clientId,
        name: data.name,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        exercises: {
          create: data.exercises.map((exercise, order) => ({
            order,
            exerciseId: exercise.exerciseId,
            // createMany = one INSERT for all of this exercise's sets.
            sets: { createMany: { data: exercise.sets.map((set, setOrder) => ({ setOrder, ...set })) } },
          })),
        },
      },
      include: withExercisesAndSets,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "duplicate";
    throw err;
  }
}

/**
 * One page of history, newest first, using KEYSET pagination: "rows strictly before the
 * last row I saw", in (startedAt, id) order. Unlike OFFSET, a workout synced late can't
 * shift the pages (no duplicates, no gaps), and every page is a quick index range scan.
 */
export function findHistoryPage(
  userId: string,
  take: number,
  after?: HistoryPosition,
): Promise<WorkoutSummaryRow[]> {
  return prisma.workout.findMany({
    where: {
      userId,
      ...(after && {
        OR: [
          { startedAt: { lt: after.startedAt } },
          { startedAt: after.startedAt, id: { lt: after.id } }, // same start time: id breaks the tie
        ],
      }),
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take,
    select: summarySelect,
  });
}
