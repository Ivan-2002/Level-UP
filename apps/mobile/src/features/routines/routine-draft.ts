import {
  clampRestSec,
  REPS_MAX,
  REST_STEP_SEC,
  resolveRestSec,
  routineInputSchema,
  TARGET_SETS_MAX,
  type Exercise,
  type Routine,
  type RoutineInput,
} from "@levelup/shared";

// The routine being created or edited in the builder, as plain data and pure functions
// (old draft in, new draft out), like active-workout.ts. The screen only wires buttons
// to these, so every rule is unit-tested without rendering.

export type DraftRoutineExercise = {
  key: string; // local key for React lists: the same exercise may appear twice
  exercise: Exercise;
  targetSets: number;
  targetReps: number; // seconds for timed exercises (plank)
  /** null = no routine-specific rest: use the player's preference or the suggestion. */
  restSec: number | null;
};

export type RoutineDraft = {
  /** null while creating; the routine's id while editing. */
  routineId: string | null;
  name: string;
  exercises: DraftRoutineExercise[];
};

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

/** Starting targets for a newly added exercise: a common hypertrophy default. */
export const DEFAULT_TARGET_SETS = 3;
const defaultTarget = (exercise: Exercise) => (exercise.repsUnit === "seconds" ? 30 : 8);
/** Timed exercises step 5 seconds at a time; reps one at a time. */
const repsStep = (exercise: Exercise) => (exercise.repsUnit === "seconds" ? 5 : 1);

export function emptyDraft(): RoutineDraft {
  return { routineId: null, name: "", exercises: [] };
}

export function draftFromRoutine(routine: Routine, newKey: () => string): RoutineDraft {
  return {
    routineId: routine.id,
    name: routine.name,
    exercises: routine.exercises.map((e) => ({
      key: newKey(),
      exercise: e.exercise,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      restSec: e.restSec,
    })),
  };
}

export function rename(draft: RoutineDraft, name: string): RoutineDraft {
  return { ...draft, name };
}

/** Adds exercises at the end, in the order they were picked. */
export function addExercises(draft: RoutineDraft, exercises: Exercise[], newKey: () => string): RoutineDraft {
  const added = exercises.map((exercise) => ({
    key: newKey(),
    exercise,
    targetSets: DEFAULT_TARGET_SETS,
    targetReps: defaultTarget(exercise),
    restSec: null,
  }));
  return { ...draft, exercises: [...draft.exercises, ...added] };
}

export function removeExercise(draft: RoutineDraft, key: string): RoutineDraft {
  return { ...draft, exercises: draft.exercises.filter((e) => e.key !== key) };
}

/** Moves an exercise one place up (-1) or down (+1). At either end, nothing changes. */
export function moveExercise(draft: RoutineDraft, key: string, direction: -1 | 1): RoutineDraft {
  const from = draft.exercises.findIndex((e) => e.key === key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= draft.exercises.length) return draft;
  const exercises = [...draft.exercises];
  [exercises[from], exercises[to]] = [exercises[to]!, exercises[from]!];
  return { ...draft, exercises };
}

/** One step more or fewer sets (1 to 10) or reps (1 to the reps limit; 5 s for timed exercises). */
export function stepTarget(draft: RoutineDraft, key: string, field: "targetSets" | "targetReps", direction: -1 | 1): RoutineDraft {
  return mapExercise(draft, key, (e) => {
    const step = field === "targetSets" ? 1 : repsStep(e.exercise);
    const max = field === "targetSets" ? TARGET_SETS_MAX : REPS_MAX;
    return { ...e, [field]: Math.min(max, Math.max(step === 1 ? 1 : step, e[field] + direction * step)) };
  });
}

/**
 * The rest the workout will actually use when the routine sets none: the player's own
 * choice, else the exercise's suggestion (same priority as the server).
 */
export function inheritedRestSec(exercise: Exercise): number {
  return resolveRestSec({ preferenceSec: exercise.restPreferenceSec, suggestedSec: exercise.suggestedRestSec });
}

/** 15 s more or less. The first step starts from the inherited value, not from nothing. */
export function stepRest(draft: RoutineDraft, key: string, direction: -1 | 1): RoutineDraft {
  return mapExercise(draft, key, (e) => ({
    ...e,
    restSec: clampRestSec((e.restSec ?? inheritedRestSec(e.exercise)) + direction * REST_STEP_SEC),
  }));
}

/** Back to "no routine rest": the preference or suggestion applies again. */
export function resetRest(draft: RoutineDraft, key: string): RoutineDraft {
  return mapExercise(draft, key, (e) => ({ ...e, restSec: null }));
}

/** The API body, checked with the same schema the server uses. */
export function toRoutineInput(draft: RoutineDraft): Result<RoutineInput> {
  const parsed = routineInputSchema.safeParse({
    name: draft.name,
    exercises: draft.exercises.map((e) => ({
      exerciseId: e.exercise.id,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      restSec: e.restSec,
    })),
  });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? "Check the routine." };
}

/** Whether leaving now would lose changes (compares what would be SAVED, not local keys). */
export function hasChanges(draft: RoutineDraft, original: RoutineDraft): boolean {
  const comparable = (d: RoutineDraft) =>
    JSON.stringify({
      name: d.name.trim(),
      exercises: d.exercises.map((e) => [e.exercise.id, e.targetSets, e.targetReps, e.restSec]),
    });
  return comparable(draft) !== comparable(original);
}

function mapExercise(draft: RoutineDraft, key: string, change: (e: DraftRoutineExercise) => DraftRoutineExercise): RoutineDraft {
  return { ...draft, exercises: draft.exercises.map((e) => (e.key === key ? change(e) : e)) };
}
