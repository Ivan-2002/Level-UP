import { prisma } from "../lib/prisma.js";
import { EXERCISE_CATALOG } from "../modules/exercises/exercise-catalog.js";
import { upsertCatalog } from "../modules/exercises/exercises.repository.js";

// `pnpm db:seed` (Prisma runs this via prisma.config.ts). Safe to run any number of times.
await upsertCatalog(EXERCISE_CATALOG);
console.log(`Seeded ${EXERCISE_CATALOG.length} exercises.`);
await prisma.$disconnect();
