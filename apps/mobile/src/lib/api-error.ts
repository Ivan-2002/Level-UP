// The API client's error type, in its own file with no side effects, so plain logic
// (and its tests) can use it without loading the auth client.

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null, // null = never reached the server
    // The API's stable error code (e.g. "UsernameTaken"). Branch on this, never on
    // `message`: messages are for humans and may be reworded at any time.
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * The server couldn't answer: no connection, a timeout, or a server error. Worth falling
 * back to saved data or retrying. A 4xx is a real answer ("not found", "invalid").
 */
export function isUnreachable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === null || error.status >= 500;
}
