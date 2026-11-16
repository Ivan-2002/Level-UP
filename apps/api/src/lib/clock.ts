// "What time is it?" for business rules that depend on the date (which week it is).
// Services call now() instead of new Date(), so tests can set the clock to "Monday
// 9 November" without faking Date everywhere (which would also confuse Better Auth's
// session expiry checks and Postgres timestamps).

let fixed: Date | null = null;

export function now(): Date {
  return fixed ? new Date(fixed) : new Date();
}

/** Tests only: freeze the clock at `at` (or pass null to use the real time again). */
export function setNow(at: Date | string | null): void {
  fixed = at === null ? null : new Date(at);
}
