import Storage from "expo-sqlite/kv-store";
import { isUnreachable } from "./api-error";

// Server data saved on the phone, so screens still work with no signal (at the gym).
// The pattern, used by the exercise library and routines:
// - every successful GET is saved under a key;
// - when the request fails (offline), the saved copy is returned instead;
// - the saved copy is also the query's starting data, so the screen opens instantly.
// Saved copies are re-checked with the shared schema when read: if an app update changed
// the shape, an old copy is ignored instead of crashing a screen.
//
// Keys for a player's own data MUST include their user id, so another account signed in
// on the same phone never sees it.

type Schema<T> = { parse: (data: unknown) => T };

export function readCached<T>(key: string, schema: Schema<T>): T | undefined {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? schema.parse(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCached(key: string, value: unknown): void {
  Storage.setItemSync(key, JSON.stringify(value));
}

export function removeCached(key: string): void {
  Storage.removeItemSync(key);
}

/**
 * Fetch, save, and fall back to the saved copy when the server can't be reached. A real
 * answer like 404 (a routine deleted on another phone) is NOT covered up: the saved copy
 * is dropped and the error passed on.
 */
export async function fetchWithDeviceCache<T>(key: string, schema: Schema<T>, fetcher: () => Promise<T>): Promise<T> {
  try {
    const fresh = await fetcher();
    writeCached(key, fresh);
    return fresh;
  } catch (error) {
    if (!isUnreachable(error)) {
      removeCached(key);
      throw error;
    }
    const cached = readCached(key, schema);
    if (cached !== undefined) return cached;
    throw error; // never fetched before AND offline: nothing to show
  }
}
