import type { NextFunction, Request, Response } from "express";
import type { ApiErrorBody } from "@levelup/shared";
import { env } from "../config/env.js";
import { AppError, type AppErrorKind } from "../lib/errors.js";

// The ONE place where business errors become HTTP responses.
const statusByKind: Record<AppErrorKind, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
};

// Express recognises an error handler by its four parameters.
// Every error ends up here, so the app always answers with the same JSON shape
// and never leaks stack traces to users in production.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Expected failures thrown by services: not bugs, so no stack trace in the logs.
  if (err instanceof AppError) {
    res.status(statusByKind[err.kind]).json({ error: err.code, message: err.message } satisfies ApiErrorBody);
    return;
  }

  // Errors from Express's own middleware, e.g. express.json() given invalid JSON (400)
  // or a body over the size limit (413). The client sent something wrong, so it's a 4xx, not a 500.
  if (isClientHttpError(err)) {
    res.status(err.status).json({ error: "BadRequest", message: err.message } satisfies ApiErrorBody);
    return;
  }

  console.error(err);
  const message = err instanceof Error ? err.message : "Unknown error";
  res.status(500).json({
    error: "InternalServerError",
    message: env.NODE_ENV === "production" ? "Something went wrong" : message,
  } satisfies ApiErrorBody);
}

function isClientHttpError(err: unknown): err is Error & { status: number } {
  return (
    err instanceof Error &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  );
}
