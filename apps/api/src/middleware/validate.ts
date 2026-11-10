import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import type { ApiErrorBody } from "@levelup/shared";

// Validation middleware: check the request against a Zod schema BEFORE the controller runs.
// - Invalid: answer 400 with every problem, so the app can show each one by its field.
// - Valid: hand the controller Zod's parsed output (trimmed strings, numbers from query
//   text, defaults filled in), so controllers only ever see clean, correctly typed data.
// Generic middleware means no controller ever hand-writes validation.

/** Validates req.body and replaces it with the parsed result. */
export function validateBody(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return sendValidationError(res, result.error);
    req.body = result.data;
    next();
  };
}

/**
 * Validates req.query and puts the parsed result in res.locals.query.
 * (Express 5 makes req.query read-only, so it can't be replaced like req.body.
 * res.locals is Express's per-request scratch space for exactly this.)
 */
export function validateQuery(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) return sendValidationError(res, result.error);
    res.locals.query = result.data;
    next();
  };
}

function sendValidationError(res: Response, error: z.ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  res.status(400).json({
    error: "ValidationError",
    message: issues[0]?.message ?? "Invalid request",
    issues,
  } satisfies ApiErrorBody);
}
