import { Router } from "express";
import type { HealthResponse } from "@levelup/shared";
import { prisma } from "../../lib/prisma.js";

// The health check answers "is the API up, and can it reach the database?"
// Hosting providers and uptime monitors call it to decide whether to restart the server.
// It has no business rules, so it skips the controller/service/repository layers.
export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let database: HealthResponse["database"] = "up";
  try {
    await prisma.$queryRaw`SELECT 1`; // the cheapest possible query
  } catch {
    database = "down";
  }

  // `satisfies` makes TypeScript check this object against the shared contract.
  const body = {
    status: database === "up" ? "ok" : "degraded",
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  } satisfies HealthResponse;

  // 503 = "Service Unavailable": tells monitors something is wrong.
  res.status(database === "up" ? 200 : 503).json(body);
});
