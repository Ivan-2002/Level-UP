// The rest timer as data + pure functions. It stores WHEN rest ends (or, while paused, how
// much was left), never a counter that ticks down: JavaScript timers stop while the app
// is in the background, but the clock doesn't. Every screen tick asks "how long until
// endsAt?", so the timer is right after the phone was locked, or the app was killed.

export type RestTimer =
  | { status: "idle" }
  | { status: "running"; endsAt: number; totalMs: number }
  | { status: "paused"; remainingMs: number; totalMs: number };

export type RestView =
  | { phase: "idle" }
  /** Counting down (or paused); `fraction` is the share of rest left, for the ring. */
  | { phase: "resting"; paused: boolean; remainingMs: number; fraction: number }
  /** The time is up and the next set hasn't been ticked yet: "Rest done. You're up." */
  | { phase: "done" };

export const IDLE: RestTimer = { status: "idle" };

export function startRest(durationSec: number, now: number): RestTimer {
  const totalMs = durationSec * 1000;
  return { status: "running", endsAt: now + totalMs, totalMs };
}

/** "+30s": more rest. The ring's full length grows if the rest now exceeds it. */
export function addRest(timer: RestTimer, seconds: number, now: number): RestTimer {
  const extra = seconds * 1000;
  if (timer.status === "running") {
    const remaining = Math.max(0, timer.endsAt - now) + extra;
    return { status: "running", endsAt: now + remaining, totalMs: Math.max(timer.totalMs, remaining) };
  }
  if (timer.status === "paused") {
    const remaining = timer.remainingMs + extra;
    return { status: "paused", remainingMs: remaining, totalMs: Math.max(timer.totalMs, remaining) };
  }
  return timer;
}

export function pauseRest(timer: RestTimer, now: number): RestTimer {
  if (timer.status !== "running" || now >= timer.endsAt) return timer;
  return { status: "paused", remainingMs: timer.endsAt - now, totalMs: timer.totalMs };
}

export function resumeRest(timer: RestTimer, now: number): RestTimer {
  if (timer.status !== "paused") return timer;
  return { status: "running", endsAt: now + timer.remainingMs, totalMs: timer.totalMs };
}

/** What to show at `now`. */
export function viewRest(timer: RestTimer, now: number): RestView {
  if (timer.status === "idle") return { phase: "idle" };
  const remainingMs = timer.status === "paused" ? timer.remainingMs : timer.endsAt - now;
  if (remainingMs <= 0) return { phase: "done" };
  return {
    phase: "resting",
    paused: timer.status === "paused",
    remainingMs,
    fraction: Math.min(1, remainingMs / timer.totalMs),
  };
}

/** When the "rest is over" notification should fire, or null if none should be scheduled. */
export function notifyAt(timer: RestTimer, now: number): number | null {
  return timer.status === "running" && timer.endsAt > now ? timer.endsAt : null;
}

/** Seconds shown on the countdown: rounded UP, so it reads 0:01 until it's really over. */
export function remainingText(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
