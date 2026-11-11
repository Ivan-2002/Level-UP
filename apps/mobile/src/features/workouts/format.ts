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
