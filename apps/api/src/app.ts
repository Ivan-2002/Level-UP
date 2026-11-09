import express from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

// createApp builds the Express app WITHOUT starting a server.
// Keeping this separate from server.ts lets tests import the app and call it directly.
export function createApp() {
  const app = express();

  app.use(helmet()); // sets safe HTTP headers

  // Better Auth handles everything under /api/auth (sign-up, sign-in, sign-out, session).
  // It MUST come before express.json(): it reads the raw request body itself, and a
  // body parser that ran first would leave it nothing to read (requests hang forever).
  // "*splat" is Express 5's syntax for "match the rest of the path".
  app.all("/api/auth/*splat", toNodeHandler(auth));

  app.use(express.json({ limit: "100kb" })); // parses JSON bodies for OUR routes

  app.use("/health", healthRouter);
  app.use(usersRouter);

  app.use(notFound); // after all routes
  app.use(errorHandler); // always last
  return app;
}
