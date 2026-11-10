import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import type { ApiErrorBody } from "@levelup/shared";

// validateBody(schema) checks req.body against a Zod schema BEFORE the controller runs.
// - Invalid: answers 400 with every problem, so the app can show each one by its field.
// - Valid: replaces req.body with Zod's parsed output (e.g. a trimmed username), so the
//   controller only ever sees clean, correctly typed data.
// One generic middleware means no controller ever hand-writes validation.
export function validateBody(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      res.status(400).json({
        error: "ValidationError",
        message: issues[0]?.message ?? "Invalid request body",
        issues,
      } satisfies ApiErrorBody);
      return;
    }
    req.body = result.data;
    next();
  };
}
