import type { BodyPart, Exercise } from "@levelup/shared";

/**
 * The picker's search + body-part filter. Matches the name or the muscle group, ignoring
 * case and accents ("lat" finds "Lat Pulldown" and anything training the lats).
 */
export function filterExercises(exercises: Exercise[], search: string, bodyPart: BodyPart | null): Exercise[] {
  const terms = normalise(search).split(/\s+/).filter(Boolean);
  return exercises.filter((exercise) => {
    if (bodyPart && exercise.bodyPart !== bodyPart) return false;
    const haystack = normalise(`${exercise.name} ${exercise.muscleGroup}`);
    return terms.every((term) => haystack.includes(term));
  });
}

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .trim();
}
