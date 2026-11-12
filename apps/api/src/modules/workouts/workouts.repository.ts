import { isUuid } from "../../lib/ids.js";
import { prisma, type Db } from "../../lib/prisma.js";
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
  routineId: string | null;
  startedAt: Date;
  finishedAt: Date;
  exercises: {
    exerciseId: string;
    restSec?: number;
    sets: { reps: number; weightKg: number; completedAt?: string }[];
  }[];
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
 * Saves the workout, its exercises and its sets in one nested create, inside the caller's
 * transaction (`db`). Order numbers come from array positions: always 0, 1, 2...
 *
 * A duplicate (userId, clientId) THROWS, on purpose: inside a transaction, a failed
 * statement aborts the whole Postgres transaction, so the caller must catch it outside
 * the transaction (see isDuplicateWorkout).
 */
export function insertWorkout(db: Db, data: NewWorkout): Promise<WorkoutDetailRow> {
  return db.workout.create({
    data: {
      userId: data.userId,
      clientId: data.clientId,
      name: data.name,
      routineId: data.routineId,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      exercises: {
        create: data.exercises.map((exercise, order) => ({
          order,
          exerciseId: exercise.exerciseId,
          restSec: exercise.restSec ?? null,
          // createMany = one INSERT for all of this exercise's sets.
          sets: {
            createMany: {
              data: exercise.sets.map((set, setOrder) => ({
                setOrder,
                reps: set.reps,
                weightKg: set.weightKg,
                completedAt: set.completedAt ? new Date(set.completedAt) : null,
              })),
            },
          },
        })),
      },
    },
    include: withExercisesAndSets,
  });
}

/** True when an error means "this (userId, clientId) was already saved" (a concurrent retry). */
export function isDuplicateWorkout(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * The workout before this one (by start time): of the same routine when it has one, else
 * any workout. Used for "compared with last time" in the summary.
 */
export function findPreviousWorkout(
  userId: string,
  current: { id: string; startedAt: Date; routineId: string | null },
): Promise<WorkoutDetailRow | null> {
  return prisma.workout.findFirst({
    where: {
      userId,
      id: { not: current.id },
      ...(current.routineId ? { routineId: current.routineId } : {}),
      OR: [{ startedAt: { lt: current.startedAt } }, { startedAt: current.startedAt, id: { lt: current.id } }],
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    include: withExercisesAndSets,
  });
}

export type ExerciseHistoryRow = {
  exerciseId: string;
  workout: { id: string; startedAt: Date };
  sets: { id: string; reps: number; weightKg: Prisma.Decimal }[];
};

/**
 * Every past appearance of these exercises in the player's workouts, oldest first, with
 * their non-flagged sets. `before` limits it to workouts that started earlier (for PRs:
 * only history before this workout counts). Records are calculated on read from this.
 */
export function findExerciseHistory(
  userId: string,
  exerciseIds: string[],
  before?: { startedAt: Date; id: string },
): Promise<ExerciseHistoryRow[]> {
  return prisma.workoutExercise.findMany({
    where: {
      exerciseId: { in: exerciseIds },
      workout: {
        userId,
        ...(before && {
          OR: [{ startedAt: { lt: before.startedAt } }, { startedAt: before.startedAt, id: { lt: before.id } }],
        }),
      },
    },
    select: {
      exerciseId: true,
      workout: { select: { id: true, startedAt: true } },
      sets: { where: { isFlagged: false }, orderBy: { setOrder: "asc" }, select: { id: true, reps: true, weightKg: true } },
    },
    orderBy: [{ workout: { startedAt: "asc" } }, { order: "asc" }],
  });
}

/** The most recent appearances of any exercise (newest first), to build "recently used". */
export function findRecentExerciseUse(userId: string, take: number): Promise<ExerciseHistoryRow[]> {
  return prisma.workoutExercise.findMany({
    where: { workout: { userId } },
    select: {
      exerciseId: true,
      workout: { select: { id: true, startedAt: true } },
      sets: { where: { isFlagged: false }, orderBy: { setOrder: "asc" }, select: { id: true, reps: true, weightKg: true } },
    },
    orderBy: [{ workout: { startedAt: "desc" } }, { order: "asc" }],
    take,
  });
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

/**
 * Workouts that may fall in a week: a window one day wider on each side than the UTC week,
 * because the player's local week can be up to 14 hours off UTC. The caller keeps those
 * whose LOCAL day is in the week. completedSets excludes flagged sets.
 */
export async function findWorkoutsAround(db: Db, userId: string, weekStart: string) {
  const from = new Date(`${weekStart}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 9);
  const rows = await db.workout.findMany({
    where: { userId, startedAt: { gte: from, lt: to } },
    select: { startedAt: true, createdAt: true, exercises: { select: { _count: { select: { sets: { where: { isFlagged: false } } } } } } },
  });
  return rows.map((w) => ({
    startedAt: w.startedAt,
    savedAt: w.createdAt,
    completedSets: w.exercises.reduce((sum, e) => sum + e._count.sets, 0),
  }));
}
