import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { expo } from "@better-auth/expo";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

// Better Auth handles sign-up, sign-in, sign-out, password hashing and sessions.
// We configure it; we never write password or session code ourselves.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  // The Expo plugin lets the mobile app (which has no browser cookies) keep a session.
  plugins: [expo()],

  // Origins allowed to call the auth endpoints. "levelup://" is the app's scheme (app.json).
  // Expo Go uses "exp://" addresses, so those are allowed in development only.
  trustedOrigins: [
    "levelup://",
    ...(env.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
  ],
});

export type Session = typeof auth.$Infer.Session;
