import {
  finishWorkoutSchema,
  MAX_WORKOUT_DURATION_MS,
  REPS_MAX,
  REPS_MIN,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  type Exercise,
  type FinishWorkoutInput,
} from "@levelup/shared";

// The workout in progress, as plain data plus pure functions (old state in, new state out).
// No React, no storage, no clock: the store in src/stores/ wires those in. That makes every
// rule here unit-testable in isolation.

export type DraftSet = {
  id: string; // local key for React lists; never sent to the API
  /** Exactly what the user typed, so half-typed input like "62." survives. */
  weightKg: string;
  reps: string;
  /** When the set was ticked done (ISO), or null if not done yet. */
  doneAt: string | null;
};

export type DraftExercise = {
  id: string; // local key; the same exercise can appear twice in one workout
  /** A copy of the exercise, so the screen can draw it with no network and no cache. */
  exercise: Exercise;
  sets: DraftSet[];
};

export type ActiveWorkout = {
  /** Whose workout this is: a different user signing in on this phone must not resume it. */
  userId: string;
  /** Generated when the workout STARTS, so every retry of Finish carries the same id. */
  clientId: string;
  startedAt: string; // ISO
  name: string;
  exercises: DraftExercise[];
};

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

// --- Building the workout ------------------------------------------------------

export function startWorkout(args: { userId: string; clientId: string; now: Date }): ActiveWorkout {
  return { userId: args.userId, clientId: args.clientId, startedAt: args.now.toISOString(), name: "", exercises: [] };
}

/** Adds the exercise with one empty set, ready to fill in. */
export function addExercise(workout: ActiveWorkout, exercise: Exercise, newId: () => string): ActiveWorkout {
  const draft: DraftExercise = { id: newId(), exercise, sets: [emptySet(newId())] };
  return { ...workout, exercises: [...workout.exercises, draft] };
}

export function removeExercise(workout: ActiveWorkout, exerciseKey: string): ActiveWorkout {
  return { ...workout, exercises: workout.exercises.filter((e) => e.id !== exerciseKey) };
}

/** Adds a set pre-filled from the previous one: most sets repeat the last weight and reps. */
export function addSet(workout: ActiveWorkout, exerciseKey: string, newId: () => string): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (exercise) => {
    const previous = exercise.sets.at(-1);
    const set: DraftSet = previous
      ? { id: newId(), weightKg: previous.weightKg, reps: previous.reps, doneAt: null }
      : emptySet(newId());
    return { ...exercise, sets: [...exercise.sets, set] };
  });
}

export function removeSet(workout: ActiveWorkout, exerciseKey: string, setKey: string): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((s) => s.id !== setKey),
  }));
}

export function updateSet(
  workout: ActiveWorkout,
  exerciseKey: string,
  setKey: string,
  changes: Partial<Pick<DraftSet, "weightKg" | "reps">>,
): ActiveWorkout {
  return mapSet(workout, exerciseKey, setKey, (set) => ({ ...set, ...changes }));
}

/**
 * Ticks a set done (only if its values are valid) or unticks it.
 * Validating here means Finish never meets an invalid completed set.
 */
export function toggleSetDone(
  workout: ActiveWorkout,
  exerciseKey: string,
  setKey: string,
  now: Date,
): Result<ActiveWorkout> {
  const exercise = workout.exercises.find((e) => e.id === exerciseKey);
  const set = exercise?.sets.find((s) => s.id === setKey);
  if (!exercise || !set) return { ok: false, message: "That set no longer exists." };

  if (set.doneAt !== null) {
    return { ok: true, value: mapSet(workout, exerciseKey, setKey, (s) => ({ ...s, doneAt: null })) };
  }
  const parsed = parseSet(set, exercise.exercise);
  if (!parsed.ok) return parsed;
  return { ok: true, value: mapSet(workout, exerciseKey, setKey, (s) => ({ ...s, doneAt: now.toISOString() })) };
}

export function setCounts(workout: ActiveWorkout): { done: number; total: number } {
  const sets = workout.exercises.flatMap((e) => e.sets);
  return { done: sets.filter((s) => s.doneAt !== null).length, total: sets.length };
}

// --- Turning typed text into numbers ------------------------------------------

/** "62,5" and "62.5" both work: many keyboards (including South African ones) type a comma. */
function parseDecimal(text: string): number {
  return Number(text.trim().replace(",", "."));
}

export function parseSet(set: DraftSet, exercise: Exercise): Result<{ reps: number; weightKg: number }> {
  const unit = exercise.repsUnit === "seconds" ? "Seconds" : "Reps";
  const reps = parseDecimal(set.reps);
  if (set.reps.trim() === "" || !Number.isInteger(reps) || reps < REPS_MIN || reps > REPS_MAX) {
    return { ok: false, message: `${unit} must be a whole number from ${REPS_MIN} to ${REPS_MAX}.` };
  }
  // Empty weight means 0: a plain bodyweight set is then just "enter reps, tick".
  const weightKg = set.weightKg.trim() === "" ? 0 : parseDecimal(set.weightKg);
  if (Number.isNaN(weightKg) || weightKg < WEIGHT_MIN_KG || weightKg > WEIGHT_MAX_KG) {
    return { ok: false, message: `Weight must be from ${WEIGHT_MIN_KG} to ${WEIGHT_MAX_KG} kg.` };
  }
  return { ok: true, value: { reps, weightKg } };
}

// --- Finish ---------------------------------------------------------------------

/**
 * The POST /workouts body: ONLY completed sets, and only exercises that have one.
 *
 * finishedAt is "now", unless that would make the workout longer than the 6-hour limit
 * (the classic "forgot to tap Finish, opened the app next morning"). Then it is the time
 * the last set was completed, which is when the session really ended. Without this, the
 * server would reject the workout for good.
 */
export function buildFinishPayload(workout: ActiveWorkout, now: Date): Result<FinishWorkoutInput> {
  const exercises: FinishWorkoutInput["exercises"] = [];
  const doneTimes: number[] = [];

  for (const draft of workout.exercises) {
    const sets: FinishWorkoutInput["exercises"][number]["sets"] = [];
    for (const set of draft.sets) {
      if (set.doneAt === null) continue;
      const parsed = parseSet(set, draft.exercise);
      if (!parsed.ok) return { ok: false, message: `${draft.exercise.name}: ${parsed.message}` };
      sets.push(parsed.value);
      doneTimes.push(Date.parse(set.doneAt));
    }
    if (sets.length > 0) exercises.push({ exerciseId: draft.exercise.id, sets });
  }

  if (exercises.length === 0) {
    return { ok: false, message: "Complete at least one set before finishing." };
  }

  const startedAt = Date.parse(workout.startedAt);
  let finishedAt = now.getTime();
  if (finishedAt - startedAt > MAX_WORKOUT_DURATION_MS) finishedAt = Math.max(...doneTimes);

  const name = workout.name.trim();
  const payload = {
    clientId: workout.clientId,
    ...(name ? { name } : {}),
    startedAt: workout.startedAt,
    finishedAt: new Date(finishedAt).toISOString(),
    exercises,
  };

  // Same schema the API uses: catch anything left (e.g. 101 sets) now, not after syncing.
  const checked = finishWorkoutSchema.safeParse(payload);
  if (!checked.success) return { ok: false, message: checked.error.issues[0]?.message ?? "This workout can't be saved." };
  return { ok: true, value: checked.data };
}

// --- Helpers ----------------------------------------------------------------------

function emptySet(id: string): DraftSet {
  return { id, weightKg: "", reps: "", doneAt: null };
}

function mapExercise(
  workout: ActiveWorkout,
  exerciseKey: string,
  change: (exercise: DraftExercise) => DraftExercise,
): ActiveWorkout {
  return { ...workout, exercises: workout.exercises.map((e) => (e.id === exerciseKey ? change(e) : e)) };
}

function mapSet(
  workout: ActiveWorkout,
  exerciseKey: string,
  setKey: string,
  change: (set: DraftSet) => DraftSet,
): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((s) => (s.id === setKey ? change(s) : s)),
  }));
}
