import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

// ONE shared Prisma client for the whole API. Each client keeps a pool of
// database connections; creating one per request would quickly exhaust Postgres.
// The PrismaPg adapter is the bridge between Prisma and the node-postgres driver (required in Prisma 7).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

/**
 * What repository functions accept as their database: the shared client above, or the
 * client of a transaction in progress (`prisma.$transaction(async (tx) => ...)`).
 * Passing `tx` lets several modules write inside ONE transaction (a "unit of work")
 * without touching each other's tables.
 */
export type Db = Prisma.TransactionClient;
