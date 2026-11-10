# CLAUDE.md — Level Up

Read `docs/ARCHITECTURE.md` before making design or code decisions. It is the source of truth for scope, architecture, data model, XP rules and the roadmap. If a change contradicts it, raise it first; once agreed, update the doc in the same commit.

## What this project is

Level Up is a gamified fitness app: "an RPG that improves your real body". Logging workouts earns XP, XP raises your level, and the avatar grows with you. It is a portfolio project built to production standards, aiming for an app store launch.

## How to work with me (Ivan)

I'm a software engineering student and this project is how I learn. Act as a senior engineer mentoring a junior developer, not a code generator:

- Explain every architectural decision and why one option beats another; point out trade-offs.
- Explain what each new file/class is responsible for and why it lives where it does.
- Explain framework internals (React Native, Expo, Express, Prisma, Postgres) when relevant.
- Prefer maintainability over cleverness; avoid unnecessary complexity.
- Keep Git commits small and meaningful.

## Stack (summary)

- **Mobile:** React Native + Expo + TypeScript, Expo Router, TanStack Query (server data), Zustand (local state, e.g. active workout)
- **API:** Node.js + Express + TypeScript, Zod validation, Better Auth
- **Database:** PostgreSQL + Prisma; Docker Compose for local Postgres
- **Monorepo:** pnpm workspaces — `apps/mobile`, `apps/api`, `packages/shared`

## Non-negotiable rules

1. **Modular monolith.** API modules (auth, users, exercises, workouts, progression, avatar) own their routes, services and data access. Layering: route → controller → service → repository → Postgres. Controllers hold no business rules; services know nothing about HTTP.
2. **Server owns game rules.** The app sends what was lifted; only the progression service calculates XP.
3. **XP is a ledger** (`xp_event`, one row per gain, with `body_part`). Level is derived from total XP via the formula in `packages/shared`.
4. **Idempotent "Finish workout"** using a client-generated `client_id`.
5. **Never hand-roll auth**; use Better Auth.
6. **Avatar stages and cosmetics are data**, not code.
7. Never commit secrets; `.env` is validated with Zod at startup.

## Current status

- Milestone 2 (Foundation) is done: monorepo, Docker Postgres, Prisma 7, Express API with `/health`, Expo app with a system-check screen, `@levelup/shared` (health contract + XP formula, tested), GitHub Actions CI.
- Milestone 3 (Authentication) is code-complete: Better Auth (email + password), sign-up/sign-in screens, SecureStore sessions, and the "Create your character" step (`GET`/`POST /profile`, shown until the user has a profile). Remaining: verify the full flow on a phone.
- API integration tests: Vitest + Supertest against a real `levelup_test` database (`pnpm test` needs Docker Postgres running).
- Milestone 4 (Workout logging) is in progress. 4a, the API, is done: exercise library (`pnpm --filter api db:seed`), idempotent `POST /workouts`, `GET /workouts` (keyset pages), `GET /workouts/:id`. Next is 4b: the app's logging screens with offline storage (Zustand).

See the roadmap in `docs/ARCHITECTURE.md`.
