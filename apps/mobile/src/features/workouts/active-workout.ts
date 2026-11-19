import {
  clampRestSec,
  coachAdvice,
  finishWorkoutSchema,
  fromInputWeight,
  MAX_WORKOUT_DURATION_MS,
  repsMaxFor,
  REPS_MIN,
  REST_STEP_SEC,
  resolveRestSec,
  toDisplayWeight,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  type DailyCapConfig,
  type Exercise,
  type FinishWorkoutInput,
  type LastSessionList,
  type LoggedSet,
  type Routine,
  type WeightUnit,
} from "@levelup/shared";

// The workout in progress, as plain data plus pure functions (old state in, new state out).
// No React, no storage, no clock: the store in src/stores/ wires those in. That makes every
// rule here unit-testable in isolation.
//
// Weights are TYPED in the player's unit (fixed for the workout when it starts, so a
// settings change mid-workout can't reinterpret numbers already typed) and converted to
// kg only when the workout is sent. Everything stored on the server stays kg.

export type DraftSet = {
  id: string; // local key for React lists; never sent to the API
  /** Exactly what the player typed, in the workout's unit, so "62." survives mid-typing. */
  weight: string;
  reps: string;
  /** When the set was ticked done (ISO), or null if not done yet. */
  doneAt: string | null;
  /**
   * The values a DONE set is scored with (null while not done): what it had when ticked,
   * replaced only when editing ends with valid values (endEditing). So typing into a done
   * set never moves the live XP keystroke by keystroke, and a half-typed value left by the
   * app being killed is never scored.
   */
  scored: SetValues | null;
};

/** A set's typed values, in the workout's unit. */
export type SetValues = Pick<DraftSet, "weight" | "reps">;

export type DraftExercise = {
  id: string; // local key; the same exercise can appear twice in one workout
  /** A copy of the exercise, so the screen can draw it with no network and no cache. */
  exercise: Exercise;
  sets: DraftSet[];
  /** The routine's target reps (null in an empty workout: the coach uses last time's). */
  targetReps: number | null;
  /** Rest between sets, resolved when added: preference > routine > suggestion > 2:00. */
  restSec: number;
  /** The player changed the rest here: Finish saves it as their preference for next time. */
  restChanged: boolean;
};

export type ActiveWorkout = {
  /** Whose workout this is: a different user signing in on this phone must not resume it. */
  userId: string;
  /** Generated when the workout STARTS, so every retry of Finish carries the same id. */
  clientId: string;
  startedAt: string; // ISO
  name: string;
  /** The unit weights are typed in, fixed at the start. */
  weightUnit: WeightUnit;
  exercises: DraftExercise[];
  /** The routine it was started from, or null. */
  routineId: string | null;
  /** The exercise on screen (survives leaving the screen or the app being killed). */
  currentExerciseKey: string | null;
  /**
   * The routine's plan as it was when the workout started, to ask "Update {routine}
   * with these changes?" on Finish. Optional: workouts saved before it existed have none.
   */
  plan?: PlannedExercise[];
  /**
   * What the live XP preview scores against, PINNED once per workout (see pinScoring in
   * live-workout.ts) and saved with it, so the total stays the same after leaving the
   * screen or the app being killed. Null until pinned. Never sent to the API.
   */
  scoring: PinnedScoring | null;
};

/**
 * The scoring context as saved on the phone (plain JSON: the history is a list, not a Map).
 * `history`: each exercise's 12-week best and jump baseline (the offline XP history when pinned);
 * `bodyweight.xp`: the XP bodyweight, `bodyweight.typed`: the real one.
 */
export type PinnedScoring = {
  history: { exerciseId: string; recentBest: number | null; jumpBaseline: number | null }[];
  bodyweight: { xp: number; typed: number };
  /** The daily cap's values and the set XP already counted on the workout's day (store v4); null = no cap data. */
  dailyCap: { config: DailyCapConfig; xpBefore: number } | null;
};

export type PlannedExercise = { exerciseId: string; targetSets: number; targetReps: number; restSec: number | null };

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** Last session's sets per exercise id (from GET /exercises/last-sessions or "recently used"). */
export type LastSets = Map<string, LoggedSet[]>;

export function lastSetsFrom(list: LastSessionList | undefined): LastSets {
  return new Map((list?.items ?? []).map((i) => [i.exerciseId, i.session.sets]));
}

// --- Building the workout ------------------------------------------------------

export function startWorkout(args: { userId: string; clientId: string; now: Date; weightUnit: WeightUnit }): ActiveWorkout {
  return {
    userId: args.userId,
    clientId: args.clientId,
    startedAt: args.now.toISOString(),
    name: "",
    weightUnit: args.weightUnit,
    exercises: [],
    routineId: null,
    currentExerciseKey: null,
    scoring: null,
  };
}

/** Saves the scoring context for this workout, once: a workout already pinned keeps its own. */
export function pinScoring(workout: ActiveWorkout, scoring: PinnedScoring): ActiveWorkout {
  return workout.scoring === null ? { ...workout, scoring } : workout;
}

/**
 * Starts from a routine: a COPY of its exercises (editing the routine later never
 * changes this workout), each with its planned sets, pre-filled by the coach rules.
 */
export function startFromRoutine(args: {
  userId: string;
  clientId: string;
  now: Date;
  weightUnit: WeightUnit;
  routine: Routine;
  lastSets?: LastSets;
  newId: () => string;
}): ActiveWorkout {
  const exercises = args.routine.exercises.map((planned) =>
    newDraftExercise(planned.exercise, args.weightUnit, args.newId, {
      targetSets: planned.targetSets,
      targetReps: planned.targetReps,
      routineRestSec: planned.restSec,
      lastSets: args.lastSets?.get(planned.exercise.id),
    }),
  );
  return {
    ...startWorkout(args),
    name: args.routine.name,
    routineId: args.routine.id,
    plan: args.routine.exercises.map((e) => ({ exerciseId: e.exercise.id, targetSets: e.targetSets, targetReps: e.targetReps, restSec: e.restSec })),
    exercises,
    currentExerciseKey: exercises[0]?.id ?? null,
  };
}

/** Adds exercises at the end, pre-filled from last time when known, and opens the first one added. */
export function addExercises(workout: ActiveWorkout, exercises: Exercise[], newId: () => string, lastSets?: LastSets): ActiveWorkout {
  if (exercises.length === 0) return workout;
  const added = exercises.map((exercise) =>
    newDraftExercise(exercise, workout.weightUnit, newId, { lastSets: lastSets?.get(exercise.id) }),
  );
  return { ...workout, exercises: [...workout.exercises, ...added], currentExerciseKey: added[0]!.id };
}

export function addExercise(workout: ActiveWorkout, exercise: Exercise, newId: () => string, lastSets?: LastSets): ActiveWorkout {
  return addExercises(workout, [exercise], newId, lastSets);
}

/** Removes an exercise; if it was on screen, the next one (or the previous) opens. */
export function removeExercise(workout: ActiveWorkout, exerciseKey: string): ActiveWorkout {
  const index = workout.exercises.findIndex((e) => e.id === exerciseKey);
  const exercises = workout.exercises.filter((e) => e.id !== exerciseKey);
  const current =
    workout.currentExerciseKey === exerciseKey ? (exercises[index] ?? exercises[index - 1] ?? null)?.id ?? null : workout.currentExerciseKey;
  return { ...workout, exercises, currentExerciseKey: current };
}

/** Links the workout to a routine just saved from it (so Finish updates its "last done"). */
export function linkRoutine(workout: ActiveWorkout, routineId: string): ActiveWorkout {
  return { ...workout, routineId };
}

export function selectExercise(workout: ActiveWorkout, exerciseKey: string): ActiveWorkout {
  return workout.exercises.some((e) => e.id === exerciseKey) ? { ...workout, currentExerciseKey: exerciseKey } : workout;
}

/** The exercise on screen: the stored one, or the first (e.g. for a workout saved by an older version). */
export function currentExercise(workout: ActiveWorkout): DraftExercise | null {
  return workout.exercises.find((e) => e.id === workout.currentExerciseKey) ?? workout.exercises[0] ?? null;
}

/** 15 s more or less rest (15 s - 10 min). Remembered as the player's own choice. */
export function stepRest(workout: ActiveWorkout, exerciseKey: string, direction: -1 | 1): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (e) => ({ ...e, restSec: clampRestSec(e.restSec + direction * REST_STEP_SEC), restChanged: true }));
}

/** Adds a set pre-filled from the previous one: most sets repeat the last weight and reps. */
export function addSet(workout: ActiveWorkout, exerciseKey: string, newId: () => string): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (exercise) => {
    const previous = exercise.sets.at(-1);
    const set: DraftSet = previous ? { id: newId(), weight: previous.weight, reps: previous.reps, doneAt: null, scored: null } : emptySet(newId());
    return { ...exercise, sets: [...exercise.sets, set] };
  });
}

export function removeSet(workout: ActiveWorkout, exerciseKey: string, setKey: string): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (exercise) => ({ ...exercise, sets: exercise.sets.filter((s) => s.id !== setKey) }));
}

export function updateSet(
  workout: ActiveWorkout,
  exerciseKey: string,
  setKey: string,
  changes: Partial<Pick<DraftSet, "weight" | "reps">>,
): ActiveWorkout {
  return mapSet(workout, exerciseKey, setKey, (set) => ({ ...set, ...changes }));
}

/**
 * Ticks a set done (only if its values are valid) or unticks it. Ticking any set also
 * ends editing (endEditing), so another set's pending edit is scored first.
 * Validating here means Finish never meets an invalid completed set.
 */
export function toggleSetDone(current: ActiveWorkout, exerciseKey: string, setKey: string, now: Date): Result<ActiveWorkout> {
  const workout = endEditing(current);
  const exercise = workout.exercises.find((e) => e.id === exerciseKey);
  const set = exercise?.sets.find((s) => s.id === setKey);
  if (!exercise || !set) return { ok: false, message: "That set no longer exists." };

  if (set.doneAt !== null) {
    return { ok: true, value: mapSet(workout, exerciseKey, setKey, (s) => ({ ...s, doneAt: null, scored: null })) };
  }
  const parsed = parseSet(set, exercise.exercise, workout.weightUnit);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: mapSet(workout, exerciseKey, setKey, (s) => ({ ...s, doneAt: now.toISOString(), scored: { weight: s.weight, reps: s.reps } })),
  };
}

/**
 * Editing ends: the field loses focus, the keyboard is dismissed, another set is ticked
 * or focused, the app goes to the background, or the workout is reopened (after the app
 * was killed). Each done set whose typed values changed is re-scored with them if they're
 * valid; if not, it keeps the values it's scored with and shows why (doneSetError).
 * Returns the same object when nothing changed (no re-render, no save).
 */
export function endEditing(workout: ActiveWorkout): ActiveWorkout {
  let changed = false;
  const exercises = workout.exercises.map((draft) => {
    const sets = draft.sets.map((set) => {
      if (set.doneAt === null || set.scored === null) return set;
      if (set.scored.weight === set.weight && set.scored.reps === set.reps) return set;
      if (!parseSet(set, draft.exercise, workout.weightUnit).ok) return set;
      changed = true;
      return { ...set, scored: { weight: set.weight, reps: set.reps } };
    });
    return sets.some((s, i) => s !== draft.sets[i]) ? { ...draft, sets } : draft;
  });
  return changed ? { ...workout, exercises } : workout;
}

/**
 * Why a done set's typed values can't be scored (e.g. reps cleared), or null. Shown under
 * the row once editing has ended; until it's fixed the set keeps its scored values.
 */
export function doneSetError(set: DraftSet, exercise: Exercise, unit: WeightUnit): string | null {
  if (set.doneAt === null) return null;
  const parsed = parseSet(set, exercise, unit);
  return parsed.ok ? null : `${parsed.message} Until then it counts as it was when ticked.`;
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

/** A set's typed values as numbers, with the weight converted to kg (what the API stores). */
export function parseSet(set: DraftSet, exercise: Exercise, unit: WeightUnit): Result<{ reps: number; weightKg: number }> {
  const label = exercise.repsUnit === "seconds" ? "Seconds" : "Reps";
  const reps = parseDecimal(set.reps);
  const max = repsMaxFor(exercise.repsUnit); // 100 reps, or 600 s for a timed exercise
  if (set.reps.trim() === "" || !Number.isInteger(reps) || reps < REPS_MIN || reps > max) {
    return { ok: false, message: `${label} must be a whole number from ${REPS_MIN} to ${max}.` };
  }
  // Empty weight means 0 only for bodyweight exercises ("enter reps, tick"; the weight is
  // what's ADDED). A barbell, dumbbell, machine, cable or kettlebell lift always has one:
  // empty is a weight not entered yet, never silently 0 kg. A typed "0" is still 0 kg.
  if (set.weight.trim() === "" && exercise.equipment !== "bodyweight") {
    return { ok: false, message: "Enter the weight." };
  }
  const typed = set.weight.trim() === "" ? 0 : parseDecimal(set.weight);
  const weightKg = Number.isNaN(typed) ? Number.NaN : fromInputWeight(typed, unit);
  if (Number.isNaN(weightKg) || weightKg < WEIGHT_MIN_KG || weightKg > WEIGHT_MAX_KG) {
    const max = Math.floor(toDisplayWeight(WEIGHT_MAX_KG, unit));
    return { ok: false, message: `Weight must be from ${WEIGHT_MIN_KG} to ${max} ${unit}.` };
  }
  return { ok: true, value: { reps, weightKg } };
}

// --- Finish ---------------------------------------------------------------------

/**
 * The POST /workouts body: ONLY completed sets, and only exercises that have one.
 * Each exercise carries the rest it used, and asks to save it as the player's
 * preference when they changed it during the workout.
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
      const parsed = parseSet(set, draft.exercise, workout.weightUnit);
      if (!parsed.ok) return { ok: false, message: `${draft.exercise.name}: ${parsed.message}` };
      sets.push({ ...parsed.value, completedAt: set.doneAt }); // the server stores when it was ticked
      doneTimes.push(Date.parse(set.doneAt));
    }
    if (sets.length > 0) {
      exercises.push({ exerciseId: draft.exercise.id, restSec: draft.restSec, ...(draft.restChanged ? { saveRestAsPreference: true } : {}), sets });
    }
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
    ...(workout.routineId ? { routineId: workout.routineId } : {}),
    startedAt: workout.startedAt,
    finishedAt: new Date(finishedAt).toISOString(),
    exercises,
  };

  // Same schema the API uses: catch anything left (e.g. 101 sets) now, not after syncing.
  const checked = finishWorkoutSchema.safeParse(payload);
  if (!checked.success) return { ok: false, message: checked.error.issues[0]?.message ?? "This workout can't be saved." };
  return { ok: true, value: checked.data };
}

// --- Saved workouts from older app versions --------------------------------------

/**
 * Upgrades a workout saved by version 1 of the store (4b: weights typed in kg, no
 * targets, rest or current exercise) to today's shape, so a workout in progress
 * survives an app update.
 */
export function migrateV1(saved: unknown): ActiveWorkout | null {
  if (!saved || typeof saved !== "object") return null;
  const old = saved as Omit<ActiveWorkout, "weightUnit" | "exercises" | "routineId" | "currentExerciseKey" | "scoring"> & {
    routineId?: string | null;
    exercises: { id: string; exercise: Exercise; sets: { id: string; weightKg: string; reps: string; doneAt: string | null }[] }[];
  };
  return {
    ...old,
    weightUnit: "kg", // version 1 always typed kg
    routineId: old.routineId ?? null,
    currentExerciseKey: old.exercises[0]?.id ?? null,
    scoring: null, // the rest of version 3's fields come from migrateV2
    exercises: old.exercises.map((e) => ({
      id: e.id,
      exercise: e.exercise,
      sets: e.sets.map((s) => ({ id: s.id, weight: s.weightKg, reps: s.reps, doneAt: s.doneAt, scored: null })),
      targetReps: null,
      restSec: resolveRestSec({ preferenceSec: e.exercise.restPreferenceSec, suggestedSec: e.exercise.suggestedRestSec }),
      restChanged: false,
    })),
  };
}

/**
 * Upgrades a workout saved by version 2 of the store (before Milestone 5's live XP) to
 * version 3:
 * - nothing pinned yet (scoring null), so the live view pins on next open, as it did then;
 * - each done set is scored with its typed values, as version 2 scored it. If they're
 *   invalid it's left out of the live total until fixed, as before.
 */
export function migrateV2(saved: unknown): ActiveWorkout | null {
  if (!saved || typeof saved !== "object") return null;
  const old = saved as Omit<ActiveWorkout, "scoring" | "exercises"> & {
    exercises: (Omit<DraftExercise, "sets"> & { sets: Omit<DraftSet, "scored">[] })[];
  };
  return {
    ...old,
    scoring: null,
    exercises: old.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => ({ ...s, scored: s.doneAt === null ? null : { weight: s.weight, reps: s.reps } })),
    })),
  };
}

// --- Helpers ----------------------------------------------------------------------

/**
 * A new exercise with its sets pre-filled by the coach rules (shared coachAdvice):
 * the number of sets is the plan's, else last time's, else 1; reps are the target (or
 * what the coach suggests); weight is the coach's target, in the player's unit.
 */
function newDraftExercise(
  exercise: Exercise,
  unit: WeightUnit,
  newId: () => string,
  plan: { targetSets?: number; targetReps?: number; routineRestSec?: number | null; lastSets?: LoggedSet[] },
): DraftExercise {
  const lastSets = plan.lastSets ?? [];
  const advice = coachAdvice({
    lastSets,
    targetReps: plan.targetReps ?? null,
    equipment: exercise.equipment,
    repsUnit: exercise.repsUnit,
    weightUnit: unit,
  });
  const weightKg = advice.kind === "first_time" ? 0 : advice.weightKg;
  const reps = advice.kind === "first_time" ? advice.targetReps : advice.reps;
  const count = plan.targetSets ?? Math.max(1, lastSets.length);

  return {
    id: newId(),
    exercise,
    targetReps: plan.targetReps ?? null,
    restSec: resolveRestSec({ preferenceSec: exercise.restPreferenceSec, routineSec: plan.routineRestSec, suggestedSec: exercise.suggestedRestSec }),
    restChanged: false,
    sets: Array.from({ length: count }, () => ({
      id: newId(),
      // 0 (bodyweight, or never done) stays empty: the input shows a "0" placeholder.
      weight: weightKg > 0 ? String(toDisplayWeight(weightKg, unit)) : "",
      reps: reps ? String(reps) : "",
      doneAt: null,
      scored: null,
    })),
  };
}

function emptySet(id: string): DraftSet {
  return { id, weight: "", reps: "", doneAt: null, scored: null };
}

function mapExercise(workout: ActiveWorkout, exerciseKey: string, change: (exercise: DraftExercise) => DraftExercise): ActiveWorkout {
  return { ...workout, exercises: workout.exercises.map((e) => (e.id === exerciseKey ? change(e) : e)) };
}

function mapSet(workout: ActiveWorkout, exerciseKey: string, setKey: string, change: (set: DraftSet) => DraftSet): ActiveWorkout {
  return mapExercise(workout, exerciseKey, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((s) => (s.id === setKey ? change(s) : s)),
  }));
}
