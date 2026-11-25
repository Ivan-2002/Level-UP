import { parseArgs } from "node:util";
import { z } from "zod";
import { bodyPartSchema, levelFromXp, localDate } from "@levelup/shared";
import { env } from "../config/env.js";
import { devToolRefusal } from "../lib/dev-only.js";
import { now } from "../lib/clock.js";
import { prisma } from "../lib/prisma.js";
import * as progressionService from "../modules/progression/progression.service.js";
import * as usersService from "../modules/users/users.service.js";

// DEVELOPMENT ONLY. Two ways to stage a test account without weeks of workouts:
//
//   pnpm --filter api dev:grant-xp <email> <amount>
//     Adds XP through the ledger (source dev_grant), to test level-ups and stages.
//
//   pnpm --filter api dev:grant-xp <email> --part <part> [--sets 12] [--weeks 26] [--until YYYY-MM-DD]
//     Adds backdated TRAINING for one body part (chest, back, shoulders, arms, core, legs):
//     one dev_grant row a week for --weeks weeks, the last on --until (default: the player's
//     local today), each worth --sets hard sets. No XP: development only, to see a part grow
//     (recent weeks) or shrink (--until months ago).
//
// It writes to the database in DATABASE_URL (the repo-root .env), and refuses to run when
// NODE_ENV is production or DATABASE_URL isn't local (localhost, 127.0.0.1 or the Compose
// service "db"). The app shows the change the next time it loads the profile or the avatar.

const refusal = devToolRefusal(env);
if (refusal) {
  console.error(`dev:grant-xp: ${refusal}`);
  process.exit(1);
}

const USAGE = [
  "Usage:",
  "  pnpm --filter api dev:grant-xp <email> <amount>   (amount: a whole number from 1 to 10,000,000)",
  "  pnpm --filter api dev:grant-xp <email> --part <chest|back|shoulders|arms|core|legs> [--sets 12] [--weeks 26] [--until YYYY-MM-DD]",
].join("\n");

const parsed = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { part: { type: "string" }, sets: { type: "string" }, weeks: { type: "string" }, until: { type: "string" } },
});

const xpArgs = z.tuple([z.string().email(), z.coerce.number().int().positive().max(10_000_000)]);
const trainingArgs = z.object({
  email: z.string().email(),
  part: bodyPartSchema,
  sets: z.coerce.number().positive().max(100).default(12),
  weeks: z.coerce.number().int().min(1).max(260).default(26),
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

try {
  if (parsed.values.part === undefined) {
    const args = xpArgs.safeParse(parsed.positionals);
    if (!args.success) throw new Error(USAGE);
    const [email, amount] = args.data;
    const userId = await userIdOf(email);
    const levelBefore = (await usersService.getProfile(userId)).level.level; // throws if no character yet
    const total = await progressionService.grantDevXp(userId, amount);
    console.log(
      `Granted ${amount} XP to ${email}: ${total} XP in total, level ${levelBefore} -> ${levelFromXp(total)}.`,
    );
  } else {
    const args = trainingArgs.safeParse({ email: parsed.positionals[0], ...parsed.values });
    if (!args.success || parsed.positionals.length !== 1) throw new Error(USAGE);
    const { email, part, sets, weeks } = args.data;
    const userId = await userIdOf(email);
    await usersService.getProfile(userId); // throws if no character yet
    const until = args.data.until ?? localDate(now(), await usersService.timeZoneOf(userId));
    const days = await progressionService.grantDevTraining(userId, { bodyPart: part, setsPerWeek: sets, weeks, until });
    console.log(
      `Granted ${part} training to ${email}: ${sets} hard sets a week for ${weeks} weeks, ${days[0]} to ${days.at(-1)}.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function userIdOf(email: string): Promise<string> {
  const userId = await usersService.userIdByEmail(email);
  if (!userId) throw new Error(`No account signed up with ${email}.`);
  return userId;
}
