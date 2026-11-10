// AppError is how services report an EXPECTED failure ("that username is taken")
// without knowing anything about HTTP. A service says WHAT went wrong (`kind`);
// the error handler decides how that looks on the wire (status code, JSON).
// That keeps services reusable from anywhere: a route, a script, a test or a queue job.

// invalid = the request is well-formed but refers to something unusable (e.g. an
// exercise id that doesn't exist): checks the schema alone can't make.
export type AppErrorKind = "invalid" | "not_found" | "conflict";

export class AppError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    /** Stable, machine-readable code the app can branch on, e.g. "UsernameTaken". */
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
