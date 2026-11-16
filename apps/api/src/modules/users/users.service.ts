import type { BodyweightEntry, CreateProfileInput, Profile, RecordBodyweightInput, UpdateProfileInput } from "@levelup/shared";
import type { Db } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { now } from "../../lib/clock.js";
import * as repo from "./users.repository.js";

// The service holds the business rules for a player's profile:
// - each user creates exactly ONE profile (their character), once;
// - usernames are unique, ignoring case.
// It knows nothing about HTTP: no req, no res, no status codes. It throws AppError,
// and the error handler decides what that looks like to the client.

export async function getProfile(userId: string): Promise<Profile> {
  const row = await repo.findProfileByUserId(userId);
  if (!row) throw new AppError("not_found", "ProfileNotFound", "You haven't created your character yet.");
  return toProfile(row);
}

export async function createProfile(userId: string, input: CreateProfileInput): Promise<Profile> {
  // These two checks give clear messages in the normal case...
  if (await repo.findProfileByUserId(userId)) throw profileExists();
  if (await repo.findProfileByUsername(input.username)) throw usernameTaken();

  const result = await repo.insertProfile({ userId, ...input, createdAt: now() });

  // ...but a concurrent request can still win the race between check and insert.
  // The database's unique constraints catch that; we just work out which one fired.
  if (result === "duplicate") {
    throw (await repo.findProfileByUserId(userId)) ? profileExists() : usernameTaken();
  }
  return toProfile(result);
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
  const row = await repo.updateProfile(userId, input);
  if (!row) throw new AppError("not_found", "ProfileNotFound", "You haven't created your character yet.");
  return toProfile(row);
}

/** Logging workouts needs a character: XP is added to it. (The app's guard ensures one.) */
export async function requireProfile(userId: string): Promise<void> {
  if (!(await repo.profileExists(userId))) {
    throw new AppError("conflict", "ProfileRequired", "Create your character before logging workouts.");
  }
}

/** Time zone and sign-up moment for the weekly goal, locking the profile (see repository). */
export async function lockGoalContext(db: Db, userId: string): Promise<{ timeZone: string; createdAt: Date }> {
  const context = await repo.lockGoalContext(db, userId);
  if (!context) throw new AppError("conflict", "ProfileRequired", "Create your character before logging workouts.");
  return context;
}

/** The player's time zone (UTC if they have no profile). */
export async function timeZoneOf(userId: string): Promise<string> {
  return (await repo.findTimeZone(userId)) ?? "UTC";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Records the player's bodyweight for a day (their LOCAL date when the app sends one).
 * A date up to one day ahead of the server's UTC date is allowed: it's already
 * "tomorrow" in timezones east of UTC.
 */
export async function recordBodyweight(userId: string, input: RecordBodyweightInput): Promise<BodyweightEntry> {
  const today = repo.todayUtc();
  const measuredOn = input.measuredOn ? new Date(input.measuredOn) : today;
  if (measuredOn.getTime() > today.getTime() + DAY_MS) {
    throw new AppError("invalid", "FutureDate", "Bodyweight can't be recorded for a future date.");
  }
  const row = await repo.upsertBodyweight(userId, input.kg, measuredOn);
  return { kg: row.kg.toNumber(), measuredOn: row.measuredOn.toISOString().slice(0, 10) };
}

/** Every bodyweight entry, oldest first (pass `db` to read inside a transaction). */
export async function bodyweightHistory(userId: string, db?: Db): Promise<BodyweightEntry[]> {
  const rows = await repo.findBodyweightEntries(userId, db);
  return rows.map((r) => ({ kg: r.kg.toNumber(), measuredOn: r.measuredOn.toISOString().slice(0, 10) }));
}

/** Adds to the cached total XP; returns the new total. The ledger stays the source of truth. */
export function addTotalXp(db: Db, userId: string, amount: number): Promise<number> {
  return repo.incrementTotalXp(db, userId, amount);
}

const profileExists = () =>
  new AppError("conflict", "ProfileExists", "You already have a character.");
const usernameTaken = () =>
  new AppError("conflict", "UsernameTaken", "That username is taken. Try another one.");

// Turns a database row into the shared API contract. This is where storage details
// stop: Postgres DECIMAL becomes a plain number, dates become ISO strings, and
// internal columns (userId, updatedAt) are not exposed.
function toProfile(row: repo.ProfileRecord): Profile {
  return {
    username: row.username,
    bodyweightKg: row.bodyweightKg === null ? null : row.bodyweightKg.toNumber(),
    weightUnit: row.weightUnit,
    timeZone: row.timeZone,
    totalXp: row.totalXp,
    createdAt: row.createdAt.toISOString(),
  };
}
