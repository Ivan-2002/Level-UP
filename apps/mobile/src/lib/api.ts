import { ApiError } from "./api-error";
import { authClient } from "./auth-client";

export { ApiError, isUnreachable } from "./api-error";

// The one place the app talks to the LevelUp API.
// Every request goes through here, so base URL, timeouts, the session cookie
// and error handling live in one place instead of in every screen.

const baseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!baseUrl) {
  // Fail loudly in development instead of sending requests to "undefined/health".
  throw new Error("EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env.");
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  timeoutMs = 8000,
): Promise<T> {
  // AbortController lets us cancel a request that hangs (common on gym Wi-Fi).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Attach the signed-in user's session cookie (from SecureStore) so protected routes know who we are.
  const headers: Record<string, string> = {};
  // getCookie may be async depending on the Better Auth version, so always await it,
  // and only send it if it's really a string (native fetch rejects any other header value).
  const cookie: unknown = await authClient.getCookie?.();
  if (typeof cookie === "string" && cookie.length > 0) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: "omit", // we set the cookie ourselves; "include" would interfere
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        json?.message ?? `Request failed (${response.status})`,
        response.status,
        typeof json?.error === "string" ? json.error : null,
      );
    }
    return json as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Keep the real cause visible in the Metro logs: "Can't reach the API" alone
    // hides whether it was a timeout, a network error or a bug in this function.
    console.warn(`[api] ${method} ${path} failed:`, error);
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new ApiError(
      timedOut ? `The API at ${baseUrl} took too long to answer` : `Can't reach the API at ${baseUrl}`,
      null,
    );
  } finally {
    clearTimeout(timer);
  }
}

// The API version this build of the app speaks. Callers pass paths without it ("/workouts"),
// so moving to /v2 one day is a change here, not in every screen.
const API_VERSION = "/v1";

export const apiGet = <T>(path: string) => request<T>("GET", `${API_VERSION}${path}`);
export const apiPost = <T>(path: string, body: unknown) => request<T>("POST", `${API_VERSION}${path}`, body);
export const apiPatch = <T>(path: string, body: unknown) => request<T>("PATCH", `${API_VERSION}${path}`, body);
export const apiPut = <T>(path: string, body: unknown) => request<T>("PUT", `${API_VERSION}${path}`, body);
/** 204 No Content: resolves with nothing. */
export const apiDelete = (path: string) => request<null>("DELETE", `${API_VERSION}${path}`);

/** For the few routes outside the versioned API: today only GET /health. */
export const apiGetUnversioned = <T>(path: string) => request<T>("GET", path);
