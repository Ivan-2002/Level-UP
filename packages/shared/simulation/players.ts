import type { SimExerciseSlug } from "./exercises.js";

// The player types the balance is checked against (docs/ARCHITECTURE.md, "Balancing is
// tested with a simulation"). Loads are realistic working sets, not maxes: "hard" means
// 1-3 reps short of failure. Add a player here when a new kind of user matters.

/** One exercise in a session: `sets` x `reps` at `kg` (added weight for bodyweight moves). */
export type PlannedExercise = { slug: SimExerciseSlug; sets: number; reps: number; kg: number };
export type Session = PlannedExercise[];

export type SimPlayer = {
  name: string;
  /** Real bodyweight, constant over the simulation. */
  bodyweightKg: number;
  /** Training days, 0 = Monday. One session per day. */
  trainingDays: number[];
  /** Done in rotation: push, pull, legs, push, ... */
  sessions: Session[];
  /**
   * Getting stronger: loads (or, for bodyweight moves, reps) grow by `perWeek` of the
   * starting value each week, up to `max` x the start.
   */
  growth: { perWeek: number; max: number };
  /** The bodyweight the player TYPES in week `week` (null = no entry). Default: the real one, once, at sign-up. */
  typedBodyweight?: (week: number) => number | null;
};

const ex = (slug: SimExerciseSlug, sets: number, reps: number, kg: number): PlannedExercise => ({ slug, sets, reps, kg });

/** Scales loaded exercises (not bodyweight ones) to `factor` of the weight, in 0.5 kg steps. */
const lighter = (session: Session, factor: number): Session =>
  session.map((e) => (e.kg === 0 ? e : { ...e, kg: Math.round(e.kg * factor * 2) / 2 }));

const fullBody: Session = [ex("barbell-back-squat", 3, 8, 50), ex("barbell-bench-press", 3, 8, 40), ex("lat-pulldown", 3, 10, 40), ex("dumbbell-curl", 2, 12, 8)];

const push: Session = [
  ex("barbell-bench-press", 4, 8, 80),
  ex("overhead-press", 3, 8, 50),
  ex("incline-dumbbell-press", 3, 10, 26),
  ex("lateral-raise", 4, 15, 10),
  ex("triceps-pushdown", 3, 12, 30),
  ex("push-up", 2, 20, 0),
];
const pull: Session = [
  ex("deadlift", 3, 5, 140),
  ex("pull-up", 4, 8, 0),
  ex("barbell-row", 3, 10, 70),
  ex("lat-pulldown", 3, 12, 60),
  ex("dumbbell-curl", 3, 12, 14),
  ex("face-pull", 3, 15, 20),
];
const legs: Session = [
  ex("barbell-back-squat", 4, 8, 100),
  ex("romanian-deadlift", 3, 10, 80),
  ex("leg-press", 3, 12, 160),
  ex("leg-extension", 3, 12, 50),
  ex("lying-leg-curl", 3, 12, 40),
  ex("standing-calf-raise", 4, 12, 60),
];

const advancedPush: Session = [
  ex("barbell-bench-press", 5, 6, 120),
  ex("overhead-press", 4, 6, 75),
  ex("incline-dumbbell-press", 4, 10, 40),
  ex("cable-fly", 3, 12, 20),
  ex("lateral-raise", 5, 15, 14),
  ex("skull-crusher", 4, 10, 40),
];
const advancedPull: Session = [
  ex("deadlift", 4, 4, 220),
  ex("pull-up", 4, 8, 20),
  ex("barbell-row", 4, 8, 110),
  ex("lat-pulldown", 4, 10, 85),
  ex("barbell-curl", 4, 10, 45),
  ex("face-pull", 3, 15, 30),
];
const advancedLegs: Session = [
  ex("barbell-back-squat", 5, 6, 160),
  ex("romanian-deadlift", 4, 8, 130),
  ex("leg-press", 4, 12, 260),
  ex("walking-lunge", 3, 12, 24),
  ex("leg-extension", 4, 15, 70),
  ex("lying-leg-curl", 4, 12, 55),
  ex("standing-calf-raise", 5, 15, 100),
];

const bodyweightOnly: Session = [
  ex("push-up", 4, 20, 0),
  ex("pull-up", 4, 8, 0),
  ex("dip", 3, 12, 0),
  ex("walking-lunge", 3, 20, 0),
  ex("hanging-leg-raise", 3, 12, 0),
  ex("plank", 3, 60, 0),
];

// Rep-range switching at the SAME strength, with loads from a standard %1RM table rather
// than from Epley itself (which would be circular): squat 1RM 125 kg, bench 95, row 90.
// Heavy 5 reps at 87%, medium 10 at 75%, light 20 at 57.5%, very light 30 at 50%.
const atPercent = (slug: SimExerciseSlug, oneRepMax: number, reps: number, percent: number, sets = 4) =>
  ex(slug, sets, reps, Math.round(oneRepMax * percent * 2) / 2);
const repRangeDay = (reps: number, percent: number): Session => [
  atPercent("barbell-back-squat", 125, reps, percent),
  atPercent("barbell-bench-press", 95, reps, percent),
  atPercent("barbell-row", 90, reps, percent),
];

const MON_WED_FRI = [0, 2, 4];

export const SIM_PLAYERS: SimPlayer[] = [
  { name: "Beginner (75 kg, 2x/wk, full body)", bodyweightKg: 75, trainingDays: [0, 3], sessions: [fullBody], growth: { perWeek: 0.01, max: 1.5 } },
  { name: "Intermediate (80 kg, 3x/wk, push/pull/legs)", bodyweightKg: 80, trainingDays: MON_WED_FRI, sessions: [push, pull, legs], growth: { perWeek: 0.002, max: 1.1 } },
  {
    name: "Advanced (90 kg, 4x/wk, high volume)",
    bodyweightKg: 90,
    trainingDays: [0, 1, 3, 4],
    sessions: [advancedPush, advancedPull, advancedLegs],
    growth: { perWeek: 0, max: 1 },
  },
  {
    // Same relative strength as the intermediate: 75% of the loads at 75% of the bodyweight.
    name: "Light (60 kg, 3x/wk, push/pull/legs at 75% loads)",
    bodyweightKg: 60,
    trainingDays: MON_WED_FRI,
    sessions: [push, pull, legs].map((s) => lighter(s, 0.75)),
    growth: { perWeek: 0.002, max: 1.1 },
  },
  { name: "Bodyweight-only (75 kg, 3x/wk)", bodyweightKg: 75, trainingDays: MON_WED_FRI, sessions: [bodyweightOnly], growth: { perWeek: 0.003, max: 1.15 } },
  {
    // Honest: never gets stronger, but changes rep range every session. Must never be jump-capped.
    name: "Rep-range switcher (80 kg, 3x/wk, 5 / 10 / 20 / 30 reps)",
    bodyweightKg: 80,
    trainingDays: MON_WED_FRI,
    sessions: [repRangeDay(5, 0.87), repRangeDay(10, 0.75), repRangeDay(20, 0.575), repRangeDay(30, 0.5)],
    growth: { perWeek: 0, max: 1 },
  },
  {
    // The "fake bodyweight drop" trick: an 80 kg intermediate who types 40 kg every week.
    name: "Cheat: intermediate typing 40 kg weekly",
    bodyweightKg: 80,
    trainingDays: MON_WED_FRI,
    sessions: [push, pull, legs],
    growth: { perWeek: 0.002, max: 1.1 },
    typedBodyweight: (week) => (week === 0 ? 80 : 40),
  },
];
