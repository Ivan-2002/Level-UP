import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs` while the component is on screen.
 * Timers DISPLAY with this; what they count from is stored (startedAt, endsAt), so a
 * paused JavaScript timer in the background never makes them wrong.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
