import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

// Express recognises an error handler by its four parameters.
// Every unexpected error ends up here, so the app always answers with the same JSON shape
// and never leaks stack traces to users in production.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({
    error: "InternalServerError",
    message: env.NODE_ENV === "production" ? "Something went wrong" : message,
  });
}
