import { BODYWEIGHT_MAX_KG, BODYWEIGHT_MIN_KG, fromInputWeight, toDisplayWeight, type WeightUnit } from "@levelup/shared";

// The rules for typing a weight in the player's own unit on Create character. Plain
// functions (no React), so they're unit-tested.

/**
 * The unit to suggest at sign-up, from the phone's measurement system (expo-localization).
 * Only "us" means pounds: the UK reports "uk", and UK gyms load plates in kg.
 * The guess can be wrong (Expo's docs call it unreliable), so the screen lets the player change it.
 */
export function weightUnitForMeasurementSystem(system: "metric" | "us" | "uk" | null | undefined): WeightUnit {
  return system === "us" ? "lb" : "kg";
}

/**
 * Typed bodyweight -> kg for the API. Empty means "not given" (bodyweight is optional).
 * Accepts "75,5" as well as "75.5", because many locales (including South Africa) type a
 * comma as the decimal separator. Unparseable text becomes NaN, which the schema reports.
 */
export function parseBodyweightInput(text: string, unit: WeightUnit): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? fromInputWeight(value, unit) : Number.NaN;
}

/**
 * The schema's range messages are in kg ("at least 30 kg"); a lb player typed lb, so
 * restate the range in their unit. Other messages pass through unchanged.
 */
export function bodyweightMessage(code: string, schemaMessage: string, unit: WeightUnit): string {
  if (code !== "too_small" && code !== "too_big") return schemaMessage;
  const { min, max } = bodyweightRange(unit);
  return `Bodyweight must be between ${min} and ${max} ${unit}.`;
}

/**
 * The accepted range as whole numbers in the player's unit, rounded INWARD: 30 kg is
 * 66.14 lb, and "66 lb" (29.94 kg) would be rejected, so the minimum we state is 67.
 */
export function bodyweightRange(unit: WeightUnit): { min: number; max: number } {
  return {
    min: Math.ceil(toDisplayWeight(BODYWEIGHT_MIN_KG, unit)),
    max: Math.floor(toDisplayWeight(BODYWEIGHT_MAX_KG, unit)),
  };
}
