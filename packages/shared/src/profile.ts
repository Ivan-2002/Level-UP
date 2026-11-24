import { z } from "zod";
import { avatarStageSchema } from "./avatar.js";
import { levelStatusSchema } from "./levels.js";
import { weightUnitSchema } from "./units.js";
import { timeZoneSchema } from "./weekly-goal.js";

// ---------------------------------------------------------------------------
// Profile ("Create your character")
//
// ONE schema, two users: the API validates POST /profile bodies with it, and the
// app validates the form with it before sending. Change a rule here and both follow.
// ---------------------------------------------------------------------------

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const BODYWEIGHT_MIN_KG = 30;
export const BODYWEIGHT_MAX_KG = 300;

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters.`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters.`)
  // Letters, digits and underscores only: no spaces, emoji or look-alike Unicode
  // characters, so "IvanLifts" can't be impersonated by a visually identical name.
  .regex(/^[A-Za-z0-9_]+$/, "Use only letters, numbers and underscores.");

export const createProfileSchema = z.object({
  username: usernameSchema,
  bodyweightKg: z
    .number({ error: "Enter your bodyweight as a number." })
    .min(BODYWEIGHT_MIN_KG, `Bodyweight must be at least ${BODYWEIGHT_MIN_KG} kg.`)
    .max(BODYWEIGHT_MAX_KG, `Bodyweight must be at most ${BODYWEIGHT_MAX_KG} kg.`)
    .optional(),
  /** The unit the player types and reads weights in. The app sends a default from the
   * device locale (US -> lb). bodyweightKg above is always kg: the app converts. */
  weightUnit: weightUnitSchema.default("kg"),
  /** The phone's IANA time zone: weeks run Monday to Sunday and days count in local time. */
  timeZone: timeZoneSchema.default("UTC"),
});

/** Body of PATCH /profile: only the fields to change (at least one). */
export const updateProfileSchema = z
  .object({ weightUnit: weightUnitSchema.optional(), timeZone: timeZoneSchema.optional() })
  .refine((body) => Object.values(body).some((v) => v !== undefined), "Send at least one field to change.");
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Body of POST /profile/celebrated: the level-up screen for `level` was shown. The server
 * keeps the highest level sent, never above the player's real level, so a repeat or a
 * late, out-of-order request changes nothing.
 */
export const celebrateLevelSchema = z.object({ level: z.number().int().min(1) });
export type CelebrateLevelInput = z.infer<typeof celebrateLevelSchema>;

/** Body of POST /bodyweight. `measuredOn` is the player's LOCAL date; defaults to today. */
export const recordBodyweightSchema = z.object({
  kg: z
    .number({ error: "Enter your bodyweight as a number." })
    .min(BODYWEIGHT_MIN_KG, `Bodyweight must be at least ${BODYWEIGHT_MIN_KG} kg.`)
    .max(BODYWEIGHT_MAX_KG, `Bodyweight must be at most ${BODYWEIGHT_MAX_KG} kg.`),
  measuredOn: z.iso.date("Use a date like 2026-11-11.").optional(),
});
export type RecordBodyweightInput = z.infer<typeof recordBodyweightSchema>;

/** One day's bodyweight. Response of POST /bodyweight. */
export type BodyweightEntry = { kg: number; measuredOn: string /* YYYY-MM-DD */ };

/** Body of POST /profile. */
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

/** Response of GET /profile and POST /profile. A schema (not only a type) so the app can check a copy saved on the phone. */
export const profileSchema = z.object({
  username: z.string(),
  bodyweightKg: z.number().nullable(),
  weightUnit: weightUnitSchema,
  timeZone: z.string(),
  totalXp: z.number().int(),
  /** The XP bar: worked out by the server, which owns the level curve (Milestone 5). */
  level: levelStatusSchema,
  /**
   * The avatar stage of that level (from the avatar_stage table). Defaults to null so a
   * profile saved on the phone before the field existed still reads.
   */
  stage: avatarStageSchema.nullable().default(null),
  /**
   * The highest level already celebrated (the level-up screen), on any phone: the app shows
   * a level-up when level.level is above it. Null only in a copy saved on the phone before
   * the field existed; the app then celebrates nothing until the server answers.
   */
  celebratedLevel: z.number().int().min(1).nullable().default(null),
  /**
   * The bodyweight XP uses today (xpBodyweightOnDate: limited at 2% a week, 40-200 kg), for
   * the app's offline XP preview. bodyweightKg above is what the player typed.
   */
  xpBodyweightKg: z.number(),
  createdAt: z.string(), // ISO 8601
});
export type Profile = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Error responses
// ---------------------------------------------------------------------------

/** Every API error has this shape. `error` is a stable code the app can branch on. */
export type ApiErrorBody = {
  error: string;
  message: string;
  /** Only on ValidationError: which field failed, and why. */
  issues?: { path: string; message: string }[];
};
