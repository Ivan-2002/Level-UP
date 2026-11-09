import express from "express";
import helmet from "helmet";
import { healthRouter } from "./modules/health/health.routes.js";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

// createApp builds the Express app WITHOUT starting a server.
// Keeping this separate from server.ts lets tests import the app and call it directly.
export function createApp() {
  const app = express();

  app.use(helmet()); // sets safe HTTP headers
  app.use(express.json({ limit: "100kb" })); // parses JSON bodies, rejects huge ones

  app.use("/health", healthRouter);
  // Future modules plug in here: app.use("/workouts", workoutsRouter), ...

  app.use(notFound); // after all routes
  app.use(errorHandler); // always last
  return app;
}
