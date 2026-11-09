import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

// ONE shared Prisma client for the whole API. Each client keeps a pool of
// database connections; creating one per request would quickly exhaust Postgres.
// The PrismaPg adapter is the bridge between Prisma and the node-postgres driver (required in Prisma 7).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
