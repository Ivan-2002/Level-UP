import { z } from "zod";
import type { Equipment } from "./workouts.js";

// ---------------------------------------------------------------------------
// Weight units. Everything is STORED and CALCULATED in kg (XP, PRs, estimated 1RM,
// coach rules); a player's unit only changes what they type and what they see.
//
// Precision: kg values are kept to 3 decimals (Postgres DECIMAL(7,3)). 1 lb is exactly
// 0.45359237 kg, so a lb value converts to a kg value with many decimals; at 3 decimals
// the round-trip error is at most 0.0005 kg (about 0.001 lb), so anything typed with up
// to 2 decimals in lb comes back EXACTLY once the display rounds to 2 decimals:
// 135 lb -> 61.235 kg -> 135 lb, and 46.25 lb -> 20.979 kg -> 46.25 lb.
// ---------------------------------------------------------------------------

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export const weightUnitSchema = z.enum(WEIGHT_UNITS);
export type WeightUnit = z.infer<typeof weightUnitSchema>;

/** Exact by definition (international avoirdupois pound, 1959). */
export const KG_PER_LB = 0.45359237;

/** Decimals kept in storage (matches the DECIMAL(7,3) columns). */
export const STORED_KG_DECIMALS = 3;
/** Decimals shown to players: enough for microplates (1.25 kg, 46.25 lb). */
export const DISPLAY_DECIMALS = 2;

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
};

/** A weight the player typed, in their unit -> kg as stored (3 decimals). */
export function fromInputWeight(value: number, unit: WeightUnit): number {
  return round(unit === "lb" ? value * KG_PER_LB : value, STORED_KG_DECIMALS);
}

/** A stored kg weight -> the number shown in the player's unit (2 decimals by default). */
export function toDisplayWeight(kg: number, unit: WeightUnit, decimals = DISPLAY_DECIMALS): number {
  return round(unit === "lb" ? kg / KG_PER_LB : kg, decimals);
}

/**
 * Text for a weight in the player's unit, without trailing zeros: "62.5 kg", "135 lb".
 * For bodyweight exercises (`bodyweight: true`) the logged weight is ADDED weight:
 * "BW" when 0, otherwise "BW + 10 kg".
 * `decimals` lowers precision for derived numbers (e.g. 1 for an estimated 1RM).
 */
export function formatWeight(
  kg: number,
  unit: WeightUnit,
  options: { bodyweight?: boolean; decimals?: number } = {},
): string {
  const value = toDisplayWeight(kg, unit, options.decimals ?? DISPLAY_DECIMALS);
  const text = `${Number(value.toFixed(options.decimals ?? DISPLAY_DECIMALS))} ${unit}`; // Number() trims zeros
  if (!options.bodyweight) return text;
  return value === 0 ? "BW" : `BW + ${text}`;
}

// --- Coach increments per unit ------------------------------------------------------

/** How much to add when every set hit its target, in the player's OWN unit (null = add reps). */
export type IncrementsInUnit = Record<Equipment, number | null>;

export const DEFAULT_INCREMENTS_BY_UNIT: Record<WeightUnit, IncrementsInUnit> = {
  kg: { barbell: 2.5, machine: 2.5, cable: 2.5, dumbbell: 1, kettlebell: 4, bodyweight: null },
  // lb gyms load in 5 lb steps (2.5 lb plates on each side); dumbbells go up 5 lb.
  lb: { barbell: 5, machine: 5, cable: 5, dumbbell: 5, kettlebell: 5, bodyweight: null },
};

/**
 * The increments for a player's unit, converted to kg for the coach maths (which always
 * works in kg). A lb player is therefore told "135 -> 140 lb", not "+2.5 kg".
 */
export function coachIncrementsKg(unit: WeightUnit, increments: IncrementsInUnit = DEFAULT_INCREMENTS_BY_UNIT[unit]) {
  return Object.fromEntries(
    Object.entries(increments).map(([equipment, step]) => [equipment, step === null ? null : fromInputWeight(step, unit)]),
  ) as Record<Equipment, number | null>;
}
