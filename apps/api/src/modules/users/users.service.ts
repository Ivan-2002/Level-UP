import type { CreateProfileInput, Profile } from "@levelup/shared";
import { AppError } from "../../lib/errors.js";
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

  const result = await repo.insertProfile({ userId, ...input });

  // ...but a concurrent request can still win the race between check and insert.
  // The database's unique constraints catch that; we just work out which one fired.
  if (result === "duplicate") {
    throw (await repo.findProfileByUserId(userId)) ? profileExists() : usernameTaken();
  }
  return toProfile(result);
}

const profileExists = () =>
  new AppError("conflict", "ProfileExists", "You already have a character.");
const usernameTaken = () =>
  new AppError("conflict", "UsernameTaken", "That username is taken. Try another one.");

// Turns a database row into the shared API contract. This is where storage details
// stop: Postgres DECIMAL becomes a plain number, dates become ISO strings, and
// internal columns (userId, updatedAt) are not exposed.
function toProfile(row: repo.ProfileRow): Profile {
  return {
    username: row.username,
    bodyweightKg: row.bodyweightKg === null ? null : row.bodyweightKg.toNumber(),
    weeklyTarget: row.weeklyTarget,
    totalXp: row.totalXp,
    streakWeeks: row.streakWeeks,
    createdAt: row.createdAt.toISOString(),
  };
}
