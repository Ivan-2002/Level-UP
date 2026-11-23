import { z } from "zod";
import { levelFromXp } from "@levelup/shared";
import { env } from "../config/env.js";
import { devToolRefusal } from "../lib/dev-only.js";
import { prisma } from "../lib/prisma.js";
import * as progressionService from "../modules/progression/progression.service.js";
import * as usersService from "../modules/users/users.service.js";

// DEVELOPMENT ONLY. Adds XP to a test account through the ledger (source dev_grant), to test
// level-ups without logging weeks of workouts:
//   pnpm --filter api dev:grant-xp <email> <amount>
// It writes to the database in DATABASE_URL (the repo-root .env), and refuses to run when
// NODE_ENV is production or DATABASE_URL isn't local (localhost, 127.0.0.1 or the Compose
// service "db"). The app shows the new level the next time it loads the profile.

const refusal = devToolRefusal(env);
if (refusal) {
  console.error(`dev:grant-xp: ${refusal}`);
  process.exit(1);
}

const args = z
  .tuple([z.string().email(), z.coerce.number().int().positive().max(10_000_000)])
  .safeParse(process.argv.slice(2));
if (!args.success) {
  console.error("Usage: pnpm --filter api dev:grant-xp <email> <amount>   (amount: a whole number from 1 to 10,000,000)");
  process.exit(1);
}
const [email, amount] = args.data;

try {
  const userId = await usersService.userIdByEmail(email);
  if (!userId) throw new Error(`No account signed up with ${email}.`);
  const levelBefore = (await usersService.getProfile(userId)).level.level; // throws if no character yet
  const total = await progressionService.grantDevXp(userId, amount);
  console.log(`Granted ${amount} XP to ${email}: ${total} XP in total, level ${levelBefore} -> ${levelFromXp(total)}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
