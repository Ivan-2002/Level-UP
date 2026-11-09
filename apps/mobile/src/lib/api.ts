import { authClient } from "./auth-client";

// The one place the app talks to the LevelUp API.
// Every request goes through here, so base URL, timeouts, the session cookie
// and error handling live in one place instead of in every screen.

const baseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!baseUrl) {
  // Fail loudly in development instead of sending requests to "undefined/health".
  throw new Error(
    "EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env.",
  );
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null, // null = never reached the server
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH",
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
      timedOut
        ? `The API at ${baseUrl} took too long to answer`
        : `Can't reach the API at ${baseUrl}`,
      null,
    );
  } finally {
    clearTimeout(timer);
  }
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body: unknown) =>
  request<T>("POST", path, body);
export const apiPatch = <T>(path: string, body: unknown) =>
  request<T>("PATCH", path, body);
