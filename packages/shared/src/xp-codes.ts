import { z } from "zod";

// The XP codes stored on each set (workout_set.flag_reason, workout_set.xp_tag) and sent in
// the Finish summary. Codes, not text: the text is built when shown, in the player's unit
// (flagReasonText, setTagText).
//
// A LEAF module (it imports only zod) on purpose: the API contracts in workouts.ts use these
// schemas, and the rule files (xp-limits.ts, set-scoring.ts) import workouts.ts, so defining
// the codes in a rule file would make an import cycle (one module would run before the
// other had defined its exports).

/**
 * Why a set was flagged. weight_above_range, reps_above_range: implausible (is_flagged:
 * 0 XP, not a PR). above_history: far above the player's own best (the jump cap); NOT
 * is_flagged: it earns XP capped at the line, and isn't a PR.
 */
export const FLAG_REASONS = ["weight_above_range", "reps_above_range", "above_history"] as const;
export const flagReasonSchema = z.enum(FLAG_REASONS);
export type FlagReason = z.infer<typeof flagReasonSchema>;

/** The label shown after a set's XP (setTagText). */
export const SET_TAGS = [
  "check_set",
  "beyond_set_limit",
  "above_history",
  "warm_up",
  "easy_set",
  "timed_limit",
] as const;
export const setTagSchema = z.enum(SET_TAGS);
export type SetTag = z.infer<typeof setTagSchema>;
