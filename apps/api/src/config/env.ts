import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the repo-root .env file in local development.
// In production there is no .env file: the host sets real environment variables.
const rootEnvPath = fileURLToPath(new URL("../../../../.env", import.meta.url));
if (existsSync(rootEnvPath)) {
  process.loadEnvFile(rootEnvPath);
}

// Describe every setting the API needs. If one is missing or wrong,
// the server refuses to start with a clear message instead of failing later.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  // Signs session cookies/tokens. Anyone who knows it can forge logins: keep it secret.
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  // The public URL of this API (Better Auth builds links and checks origins with it).
  BETTER_AUTH_URL: z.string().url(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
