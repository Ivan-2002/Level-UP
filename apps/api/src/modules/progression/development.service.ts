import {
  developmentByPart,
  levelFromXp,
  localDate,
  stageForLevel,
  type AvatarResponse,
  type DevelopmentValues,
} from "@levelup/shared";
import { now } from "../../lib/clock.js";
import * as avatarService from "../avatar/avatar.service.js";
import * as usersService from "../users/users.service.js";
import * as repo from "./development.repository.js";

// Body-part development (docs/ARCHITECTURE.md, "Avatar prototype"). The RULE is the pure
// developmentByPart in @levelup/shared; this file feeds it the ledger's dated stimulus and
// is the only place the API evaluates it. Calculated on every read: no stored value, no
// scheduled job (shrinking happens because the evaluation day moves on).
// Dependencies: progression -> users (total XP, time zone), avatar (stages).

/** Development values are sent rounded to 4 decimals: stable numbers, smaller payloads. */
const round = (v: number) => Math.round(v * 10_000) / 10_000;
const rounded = (values: DevelopmentValues): DevelopmentValues =>
  Object.fromEntries(Object.entries(values).map(([part, v]) => [part, round(v)])) as DevelopmentValues;

/** GET /v1/avatar: the player's stage and every body part's development on their local today. */
export async function avatarOf(userId: string): Promise<AvatarResponse> {
  const { totalXp, timeZone } = await usersService.avatarContext(userId);
  const today = localDate(now(), timeZone);
  const [rows, stages] = await Promise.all([repo.stimulusByPartAndDay(userId, today), avatarService.allStages()]);
  const { development, lastTrainedOn } = developmentByPart(rows, today);
  return {
    stage: stageForLevel(stages, levelFromXp(totalXp)),
    stages,
    development: rounded(development),
    stamina: 0, // the endurance milestone
    lastTrainedOn,
  };
}

/**
 * Development just before and just after one workout, on the local day it started, in
 * ledger order: "before" is every row recorded before the workout was saved; "after" adds
 * the workout's own rows. Rows recorded later (a workout synced afterwards, even one that
 * started earlier) are never in either, so a repeated Finish and every later read of the
 * summary return the same numbers.
 *
 * `day`: the local day the workout's XP rows were dated (earned_on, fixed at Finish); for a
 * workout with no XP rows (too old, or every set earned 0), its start day in the player's
 * current zone.
 */
export async function workoutDevelopment(
  userId: string,
  workout: { setIds: string[]; savedAt: Date; startedAt: Date },
): Promise<{ before: DevelopmentValues; after: DevelopmentValues }> {
  const own = await repo.stimulusOfSets(workout.setIds);
  const day = own[0]?.day ?? localDate(workout.startedAt, await usersService.timeZoneOf(userId));
  const earlier = await repo.stimulusByPartAndDay(userId, day, workout.savedAt);
  return {
    before: rounded(developmentByPart(earlier, day).development),
    after: rounded(developmentByPart([...earlier, ...own], day).development),
  };
}
