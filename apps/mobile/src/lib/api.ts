// The one place the app talks to the LevelUp API.
// Every request goes through apiGet/apiPost (later), so base URL, timeouts,
// auth headers and error handling live here instead of in every screen.

const baseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!baseUrl) {
  // Fail loudly in development instead of sending requests to "undefined/health".
  throw new Error("EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env.");
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

export async function apiGet<T>(path: string, timeoutMs = 8000): Promise<T> {
  // AbortController lets us cancel a request that hangs (common on gym Wi-Fi).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Can't reach the API at ${baseUrl}`, null);
  } finally {
    clearTimeout(timer);
  }
}
