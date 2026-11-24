import { formatWeight, type Exercise, type WeightUnit } from "@levelup/shared";

/** 32:14 under an hour, 1:05:09 after. Never negative (a phone clock moved backwards). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** "chest" -> "Chest". */
export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "1 workout" / "3 workouts". */
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Rest time: 90 -> "1:30", 45 -> "0:45". */
export function formatRest(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * When a routine was last done, in local calendar days: "Today", "Yesterday",
 * "3 days ago" within a week, then a date ("12 Oct"; with the year if not this year).
 */
export function formatLastDone(iso: string | null, now: Date): string {
  if (iso === null) return "Not done yet";
  const done = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(done)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const sameYear = done.getFullYear() === now.getFullYear();
  return done.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/**
 * One set as text in the player's unit: "62.5 kg × 8", "BW × 9", "BW + 10 kg × 8",
 * and for timed exercises "60 s" (or "10 kg × 60 s" with weight).
 */
export function formatSet(
  set: { reps: number; weightKg: number },
  exercise: Pick<Exercise, "equipment" | "repsUnit">,
  unit: WeightUnit,
): string {
  const bodyweight = exercise.equipment === "bodyweight";
  const reps = exercise.repsUnit === "seconds" ? `${set.reps} s` : String(set.reps);
  if (exercise.repsUnit === "seconds" && set.weightKg === 0 && !bodyweight) return reps;
  return `${formatWeight(set.weightKg, unit, { bodyweight })} × ${reps}`;
}

/** The set to show as "last time": the heaviest, then the most reps. */
export function topSet<T extends { reps: number; weightKg: number }>(sets: T[]): T | null {
  return sets.reduce<T | null>(
    (best, s) =>
      !best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps) ? s : best,
    null,
  );
}
