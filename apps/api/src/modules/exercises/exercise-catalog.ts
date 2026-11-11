import type { BodyPart, Equipment, Mechanic, RepsUnit } from "@levelup/shared";

// The built-in exercise library. `pnpm db:seed` upserts these by slug, so editing a value
// here and re-seeding retunes it in the database without creating duplicates.
//
// HOW THE XP TUNING VALUES WERE CHOSEN (first guesses; tune with real workouts)
//
//   effective load per rep = (weight + bodyweight x bodyweightRatio) x loadFactor
//
// Goal: a HARD set of any exercise earns roughly the same XP, so nobody is punished for
// training a muscle that naturally lifts less. Benchmark: an intermediate 80 kg lifter's
// hard set of back squats, 100 kg x 8 reps = ~800 kg of volume.
//
// - bodyweightRatio: the share of your body you actually move (common biomechanics
//   estimates). Push-up ~64% -> 0.65, pull-up all of it -> 1.0, dip ~0.95 (the hands stay
//   put), hanging leg raise only the legs -> 0.35. It is 0 for loaded lifts: there the
//   logged weight is the bar/stack, and loadFactor does the balancing.
// - loadFactor ~= 800 / (typical hard-set reps x effective load), rounded. Example:
//   lateral raise 10 kg x 15 = 150 -> ~5. Light isolation lifts get high factors.
//
// REST TIMES (suggestedRestSec, multiples of 15 s, the app's timer step):
// - compound lifts 2:00-3:00: 3:00 for the heaviest barbell lifts (squat, deadlift,
//   bench), 2:00-2:30 for other compounds, 1:30 for push-ups (compound but bodyweight).
// - isolation and core 0:45-1:30: mostly 1:00-1:15.
// Players can override this per exercise (exercise_preference), and routines can too.
//
// LOGGING CONVENTIONS the app must show in its UI:
// - Dumbbell weight is PER DUMBBELL (the number printed on it). Factors account for that.
// - Bodyweight exercises log ADDED weight (belt, vest); 0 for plain reps.
// - Plank logs seconds held in the reps field (so at most 100 s per set for now). It is
//   marked repsUnit: "seconds" so the app can label the column, without hard-coding names.

export type CatalogExercise = {
  slug: string;
  name: string;
  muscleGroup: string;
  bodyPart: BodyPart;
  equipment: Equipment;
  loadFactor: number;
  bodyweightRatio: number;
  mechanic: Mechanic;
  suggestedRestSec: number;
  /** Defaults to "reps". */
  repsUnit?: RepsUnit;
};

//  Comment = the "typical hard set" the factor was derived from.
export const EXERCISE_CATALOG: CatalogExercise[] = [
  // --- Legs ---------------------------------------------------------------
  { slug: "barbell-back-squat", name: "Back Squat", muscleGroup: "Quadriceps", bodyPart: "legs", equipment: "barbell", loadFactor: 1.0, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 180 }, // 100 x 8 (benchmark)
  { slug: "romanian-deadlift", name: "Romanian Deadlift", muscleGroup: "Hamstrings", bodyPart: "legs", equipment: "barbell", loadFactor: 1.1, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 150 }, // 90 x 8
  { slug: "leg-press", name: "Leg Press", muscleGroup: "Quadriceps", bodyPart: "legs", equipment: "machine", loadFactor: 0.5, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 150 }, // 160 x 10: sled leverage makes numbers big
  { slug: "leg-extension", name: "Leg Extension", muscleGroup: "Quadriceps", bodyPart: "legs", equipment: "machine", loadFactor: 1.3, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 75 }, // 50 x 12
  { slug: "lying-leg-curl", name: "Lying Leg Curl", muscleGroup: "Hamstrings", bodyPart: "legs", equipment: "machine", loadFactor: 1.7, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 75 }, // 40 x 12
  { slug: "walking-lunge", name: "Walking Lunge", muscleGroup: "Glutes", bodyPart: "legs", equipment: "dumbbell", loadFactor: 0.9, bodyweightRatio: 0.75, mechanic: "compound", suggestedRestSec: 120 }, // (16 + 60) x 12: you carry most of your body
  { slug: "kettlebell-swing", name: "Kettlebell Swing", muscleGroup: "Glutes & hamstrings", bodyPart: "legs", equipment: "kettlebell", loadFactor: 2.2, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 120 }, // 24 x 15
  { slug: "standing-calf-raise", name: "Standing Calf Raise", muscleGroup: "Calves", bodyPart: "legs", equipment: "machine", loadFactor: 0.7, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 80 x 15

  // --- Back ---------------------------------------------------------------
  { slug: "deadlift", name: "Deadlift", muscleGroup: "Posterior chain", bodyPart: "back", equipment: "barbell", loadFactor: 1.2, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 180 }, // 130 x 5
  { slug: "pull-up", name: "Pull-up", muscleGroup: "Lats", bodyPart: "back", equipment: "bodyweight", loadFactor: 1.25, bodyweightRatio: 1.0, mechanic: "compound", suggestedRestSec: 150 }, // (0 + 80) x 8
  { slug: "lat-pulldown", name: "Lat Pulldown", muscleGroup: "Lats", bodyPart: "back", equipment: "cable", loadFactor: 1.3, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 120 }, // 60 x 10
  { slug: "barbell-row", name: "Barbell Row", muscleGroup: "Upper back", bodyPart: "back", equipment: "barbell", loadFactor: 1.4, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 150 }, // 70 x 8
  { slug: "seated-cable-row", name: "Seated Cable Row", muscleGroup: "Upper back", bodyPart: "back", equipment: "cable", loadFactor: 1.3, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 120 }, // 60 x 10
  { slug: "one-arm-dumbbell-row", name: "One-arm Dumbbell Row", muscleGroup: "Lats", bodyPart: "back", equipment: "dumbbell", loadFactor: 2.5, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 120 }, // 30 x 10

  // --- Chest --------------------------------------------------------------
  { slug: "barbell-bench-press", name: "Bench Press", muscleGroup: "Chest", bodyPart: "chest", equipment: "barbell", loadFactor: 1.25, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 180 }, // 80 x 8
  { slug: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscleGroup: "Upper chest", bodyPart: "chest", equipment: "dumbbell", loadFactor: 3.0, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 150 }, // 26 (each) x 10
  { slug: "machine-chest-press", name: "Machine Chest Press", muscleGroup: "Chest", bodyPart: "chest", equipment: "machine", loadFactor: 1.3, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 120 }, // 60 x 10
  { slug: "cable-fly", name: "Cable Fly", muscleGroup: "Chest", bodyPart: "chest", equipment: "cable", loadFactor: 4.5, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 75 }, // 15 x 12
  { slug: "push-up", name: "Push-up", muscleGroup: "Chest", bodyPart: "chest", equipment: "bodyweight", loadFactor: 0.8, bodyweightRatio: 0.65, mechanic: "compound", suggestedRestSec: 90 }, // (0 + 52) x 20

  // --- Shoulders ----------------------------------------------------------
  { slug: "overhead-press", name: "Overhead Press", muscleGroup: "Front delts", bodyPart: "shoulders", equipment: "barbell", loadFactor: 2.0, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 150 }, // 50 x 8
  { slug: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", muscleGroup: "Front delts", bodyPart: "shoulders", equipment: "dumbbell", loadFactor: 3.5, bodyweightRatio: 0, mechanic: "compound", suggestedRestSec: 120 }, // 22 (each) x 10
  { slug: "lateral-raise", name: "Lateral Raise", muscleGroup: "Side delts", bodyPart: "shoulders", equipment: "dumbbell", loadFactor: 5.0, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 10 (each) x 15
  { slug: "face-pull", name: "Face Pull", muscleGroup: "Rear delts", bodyPart: "shoulders", equipment: "cable", loadFactor: 2.0, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 25 x 15

  // --- Arms ---------------------------------------------------------------
  { slug: "barbell-curl", name: "Barbell Curl", muscleGroup: "Biceps", bodyPart: "arms", equipment: "barbell", loadFactor: 2.3, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 75 }, // 35 x 10
  { slug: "dumbbell-curl", name: "Dumbbell Curl", muscleGroup: "Biceps", bodyPart: "arms", equipment: "dumbbell", loadFactor: 5.0, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 14 (each) x 12
  { slug: "hammer-curl", name: "Hammer Curl", muscleGroup: "Brachialis & forearms", bodyPart: "arms", equipment: "dumbbell", loadFactor: 5.0, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 16 (each) x 10
  { slug: "triceps-pushdown", name: "Triceps Pushdown", muscleGroup: "Triceps", bodyPart: "arms", equipment: "cable", loadFactor: 2.2, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 30 x 12
  { slug: "skull-crusher", name: "Skull Crusher", muscleGroup: "Triceps", bodyPart: "arms", equipment: "barbell", loadFactor: 2.7, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 75 }, // 30 x 10
  { slug: "dip", name: "Dip", muscleGroup: "Triceps & chest", bodyPart: "arms", equipment: "bodyweight", loadFactor: 1.0, bodyweightRatio: 0.95, mechanic: "compound", suggestedRestSec: 120 }, // (0 + 76) x 10

  // --- Core ---------------------------------------------------------------
  { slug: "plank", name: "Plank", muscleGroup: "Abs", bodyPart: "core", equipment: "bodyweight", loadFactor: 0.35, bodyweightRatio: 0.5, repsUnit: "seconds", mechanic: "isolation", suggestedRestSec: 60 }, // (0 + 40) x 60 s
  { slug: "hanging-leg-raise", name: "Hanging Leg Raise", muscleGroup: "Abs", bodyPart: "core", equipment: "bodyweight", loadFactor: 2.4, bodyweightRatio: 0.35, mechanic: "isolation", suggestedRestSec: 60 }, // (0 + 28) x 12
  { slug: "ab-wheel-rollout", name: "Ab Wheel Rollout", muscleGroup: "Abs", bodyPart: "core", equipment: "bodyweight", loadFactor: 2.0, bodyweightRatio: 0.5, mechanic: "isolation", suggestedRestSec: 60 }, // (0 + 40) x 10
  { slug: "cable-crunch", name: "Cable Crunch", muscleGroup: "Abs", bodyPart: "core", equipment: "cable", loadFactor: 1.3, bodyweightRatio: 0, mechanic: "isolation", suggestedRestSec: 60 }, // 40 x 15
];
