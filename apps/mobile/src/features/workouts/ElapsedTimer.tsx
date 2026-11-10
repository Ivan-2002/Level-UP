import { useEffect, useState } from "react";
import { Text, type TextStyle } from "react-native";
import { formatElapsed } from "./format";

// Shows time since the workout started, updated every second.
// It is ALWAYS computed from startedAt (not by counting ticks), so it is still right after
// the app was backgrounded or killed, when JavaScript timers don't run.
export function ElapsedTimer({ startedAt, style }: { startedAt: string; style?: TextStyle }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <Text style={style}>{formatElapsed(now - Date.parse(startedAt))}</Text>;
}
