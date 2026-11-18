import { isUuid } from "../../lib/ids.js";
import { prisma, type Db } from "../../lib/prisma.js";
import { Prisma, type XpHeldBackReason } from "../../generated/prisma/client.js";

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
  /** Set XP the workout didn't get, and why (0 and null when it got it all). */
  xpHeldBack: number;
  xpHeldBackReason: XpHeldBackReason | null;
  exercises: {
    exerciseId: string;
    restSec?: number;
    /** Each set as logged, with what the XP scoring decided about it. */
    sets: { reps: number; weightKg: number; completedAt?: string; isFlagged: boolean; flagReason: string | null; xpTag: string | null }[];
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
      xpHeldBack: data.xpHeldBack,
      xpHeldBackReason: data.xpHeldBackReason,
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
                isFlagged: set.isFlagged,
                flagReason: set.flagReason,
                xpTag: set.xpTag,
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

// Non-flagged sets only. flagReason tells jump-capped sets (above_history) apart: they
// count for the jump baseline but are never PRs.
const historySets = {
  where: { isFlagged: false },
  orderBy: { setOrder: "asc" },
  select: { id: true, reps: true, weightKg: true, flagReason: true },
} satisfies Prisma.WorkoutExercise$setsArgs;

export type ExerciseHistoryRow = {
  exerciseId: string;
  workout: { id: string; startedAt: Date };
  sets: { id: string; reps: number; weightKg: Prisma.Decimal; flagReason: string | null }[];
};

/**
 * Every past appearance of these exercises (null: of every exercise) in the player's
 * workouts, oldest first, with their non-flagged sets. `before` limits it to workouts that started earlier: by
 * (startedAt, id) for a saved workout (PRs), by startedAt alone for one not saved yet
 * (Finish, before its insert). Pass `db` to read inside a transaction.
 */
export function findExerciseHistory(
  userId: string,
  exerciseIds: string[] | null,
  before?: { startedAt: Date; id?: string },
  db: Db = prisma,
): Promise<ExerciseHistoryRow[]> {
  const earlier = before && {
    OR: [
      { startedAt: { lt: before.startedAt } },
      ...(before.id === undefined ? [] : [{ startedAt: before.startedAt, id: { lt: before.id } }]),
    ],
  };
  return db.workoutExercise.findMany({
    where: { ...(exerciseIds && { exerciseId: { in: exerciseIds } }), workout: { userId, ...earlier } },
    select: {
      exerciseId: true,
      workout: { select: { id: true, startedAt: true } },
      sets: historySets,
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
      sets: historySets,
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
