// Guards for development-only tools (pnpm --filter api dev:grant-xp). Plain functions, so
// the rules are unit-tested without touching a database.

/**
 * Database hosts a dev tool may write to: this machine, or the Docker Compose service
 * name ("db" in docker-compose.yml, the host name inside the Compose network).
 */
export const LOCAL_DATABASE_HOSTS = ["localhost", "127.0.0.1", "db"] as const;

/**
 * Why a dev tool must not run here, or null when it may. Two independent checks, because
 * NODE_ENV alone trusts the shell: a local .env pointed at a hosted database (staging, a
 * cloud Postgres) still says "development". The host check catches that.
 */
export function devToolRefusal(env: { NODE_ENV: string; DATABASE_URL: string }): string | null {
  if (env.NODE_ENV === "production") return "Refused: NODE_ENV is production.";
  const host = new URL(env.DATABASE_URL).hostname;
  if (!(LOCAL_DATABASE_HOSTS as readonly string[]).includes(host)) {
    return `Refused: DATABASE_URL points at "${host}", not a local database (${LOCAL_DATABASE_HOSTS.join(", ")}).`;
  }
  return null;
}
