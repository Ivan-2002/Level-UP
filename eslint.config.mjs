// ESLint for the API and the shared package (the mobile app has its own Expo config in
// apps/mobile). `pnpm lint` runs it in each package, and the pre-commit hook runs that.
//
// Not type-aware on purpose: type-aware rules need the TypeScript compiler API, and the
// API is on TypeScript 7. `pnpm typecheck` covers types; this covers what tsc doesn't
// (unused code, risky patterns).
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["apps/mobile/**", "**/dist/**", "**/node_modules/**", "apps/api/src/generated/**"] },
  {
    files: ["apps/api/**/*.ts", "packages/shared/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // A leading underscore marks an argument that must exist but isn't used (Express's `next`).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
]);
