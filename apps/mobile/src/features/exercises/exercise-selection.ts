import type { BodyPart, Exercise, RecentExerciseList } from "@levelup/shared";
import { filterExercises } from "./filter-exercises";

// The Add exercise sheet's rules: multi-select in the order you tap, "Recently used"
// above "All exercises", and the main button's label. Plain functions, unit-tested.

type RecentItem = RecentExerciseList["items"][number];

/** Selected ids in the order they were picked (that's the order they're added in). */
export function toggleSelected(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

export function addButtonLabel(count: number): string {
  if (count === 0) return "Select exercises";
  return count === 1 ? "Add 1 exercise" : `Add ${count} exercises`;
}

/**
 * Both lists follow the search and muscle-group filter. "Recently used" uses the full
 * library entry (so a renamed exercise shows its new name) and isn't repeated below.
 */
export function groupExercises(args: {
  library: Exercise[];
  recent: RecentItem[];
  search: string;
  bodyPart: BodyPart | null;
}): { recent: RecentItem[]; all: Exercise[] } {
  const matching = filterExercises(args.library, args.search, args.bodyPart);
  const matchingIds = new Set(matching.map((e) => e.id));
  const recent = args.recent.filter((r) => matchingIds.has(r.exercise.id));
  const recentIds = new Set(recent.map((r) => r.exercise.id));
  return { recent, all: matching.filter((e) => !recentIds.has(e.id)) };
}

/** "Bench Press" -> "BP", "Plank" -> "PL": the tile at the start of each row. */
export function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  const letters = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 2);
  return letters.slice(0, 2).toUpperCase();
}
