# Level Up — Project Context & Architecture

_Last updated: 2026-11-11 · Source of truth for architecture decisions. Keep this file in sync when decisions change._

## Vision & MVP scope

Level Up is "an RPG that improves your real body": logging real workouts earns XP, XP raises your level, and your avatar visibly grows with you. It is a portfolio project built to production standards, with the goal of launching on the app stores.

**The MVP is one core loop, done well:**

1. Log a workout (exercises, sets, reps, weight).
2. The server awards XP for it.
3. XP raises your level.
4. Your avatar changes as you level up.

**In the MVP:** register and log in, a predefined exercise library, workout logging that tolerates bad gym signal, XP and levels with a weekly consistency streak, a stickman avatar that grows, and a home screen showing avatar, level and XP bar.

**Deferred until the loop works:** custom exercises, cosmetics shop and unlocks beyond growth stages, quests, muscle-group variety bonus, achievements, the rules-based coach, leaderboards, social features, and any AI.

## Working agreement

This project is a learning experience as much as a product. Claude acts as a senior engineer mentoring a junior developer, not as a code generator.

- Explain every architectural decision, and why one option beats another.
- Point out trade-offs; when several good solutions exist, say why one was chosen.
- Explain what each file and class is responsible for, and why it lives where it does.
- Explain framework internals (React Native, Expo, Express, Prisma, Postgres) instead of assuming prior knowledge.
- Follow Clean Architecture, SOLID and single-responsibility where they help; prefer maintainability over cleverness.
- Small, meaningful Git commits; good documentation alongside the code.
- Flag design issues early, and explain the reasoning before changing an agreed design.

## Tech stack

TypeScript runs end to end, so types are shared between the app and the API. This stack replaces the earlier Flutter + Firebase version (paused at Milestone 3, October 2026).

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile app | React Native + Expo + TypeScript | One codebase for iOS and Android; Expo handles builds, store submission and over-the-air updates |
| Navigation | Expo Router | File-based routes, auth-guarded route groups, deep linking |
| Server data | TanStack Query | Caching, retries and refetching for API data |
| Local UI state | Zustand (persisted to `expo-sqlite/kv-store`) | Holds the in-progress workout and the outbox of finished workouts on the device |
| API | Node.js + Express + TypeScript | Own backend; the service layer owns all workout, XP and level rules |
| Validation | Zod (shared) | One schema validates requests on the server and forms in the app |
| Database | PostgreSQL + Prisma | Relational data fits workouts and sets; Prisma gives typed queries and migrations |
| Auth | Better Auth (library inside our API) | Proven password and session handling without vendor lock-in |
| Local dev | Docker Compose | Runs Postgres locally the same way every time |
| Tooling | VS Code, Git, GitHub, MacBook Air M3 | |

## Architecture principles

Six rules keep the app simple today and launchable later. Each one is recorded with its trade-off in the decision log.

```mermaid
flowchart LR
    subgraph Mobile["Mobile app (Expo)"]
        M1["Screens (Expo Router)<br/>TanStack Query: API data<br/>Zustand: active workout<br/>Stickman avatar (SVG)"]
    end
    subgraph API["API (Node + Express)"]
        MW["Middleware: auth guard, validation"]
        AUTH[Auth]
        WO[Workouts]
        PROG["Progression (owns XP rules)"]
        AV[Avatar]
    end
    DB[("PostgreSQL<br/>workouts and sets<br/>xp_event ledger<br/>profiles, avatar stages")]
    SHARED["packages/shared<br/>Zod schemas, TS types, XP formula"]

    Mobile <-- JSON --> API
    API <-- SQL --> DB
    Mobile -. imports .-> SHARED
    API -. imports .-> SHARED
```

The Progression module is the only place XP is calculated; the app and API share types and the level formula through `packages/shared`.

1. **Modular monolith.** One API, split into modules (auth, users, exercises, workouts, progression, avatar). Each module owns its routes, service and data access. Modules talk through service functions, never each other's tables. One Node server plus Postgres can serve tens of thousands of users; a module can be split out later if it ever needs to be.
2. **The server owns the game rules.** The app sends what was lifted, never how much XP to award. This blocks cheating before leaderboards exist, and lets us rebalance progression without an app update.
3. **XP is a ledger.** Every XP gain is its own row. Total XP is the sum; level is calculated from total XP. A cached total on the user keeps reads fast, but the ledger is the source of truth.
4. **Offline-tolerant logging.** The in-progress workout lives on the phone. "Finish" sends the whole workout in one request with a client-generated ID (`clientId`, unique per user), so a retry on bad signal cannot count the workout twice (an idempotent request): the first call returns 201, any repeat returns 200 with the workout already saved.
5. **Proven auth, not home-made.** Better Auth handles password hashing, sessions and resets inside our own API.
6. **Cosmetics are data, not code.** Avatar stages and items live in the database with their unlock rules, so new content needs no app release.

Each API module follows the same layering: route → controller (HTTP in/out) → service (business rules) → repository (Prisma queries) → Postgres. Controllers never hold rules; services never know about HTTP. Services report expected failures by throwing an `AppError` with a domain `kind` (`not_found`, `conflict`) and a stable `code` (e.g. `UsernameTaken`); the one error handler maps it to a status code, and every error response has the shape `{ error, message, issues? }`. Request bodies are checked by a `validateBody(schema)` middleware using the shared Zod schemas.

## Repository structure

One monorepo holds the app, the API and the shared types, managed with pnpm workspaces. A change to an API contract and the app code that uses it land in the same commit.

```text
Level-UP/
├── apps/
│   ├── mobile/                 # Expo app
│   │   ├── app/                # Expo Router screens: (auth)/, (app)/
│   │   └── src/
│   │       ├── components/     # reusable UI (Button, XpBar, Avatar)
│   │       ├── features/       # auth, profile, workouts, exercises, progression, avatar
│   │       ├── lib/            # API client, query client, storage
│   │       └── stores/         # Zustand stores (active workout)
│   └── api/                    # Express API
│       ├── prisma/schema.prisma
│       └── src/
│           ├── modules/        # auth, users, exercises, workouts, progression, avatar
│           ├── middleware/     # auth guard, error handler, request validation
│           ├── config/         # env loading and checks
│           └── app.ts
├── packages/
│   └── shared/                 # Zod schemas, TS types, XP formula
├── docs/                       # Architecture, Decisions, Roadmap, DevelopmentJournal
├── docker-compose.yml          # local Postgres
├── .github/workflows/          # CI
├── CLAUDE.md                   # context for Claude in VS Code
└── README.md
```

The XP-to-level formula lives in `packages/shared`, so the app can draw the XP bar with the same maths the server uses. The server still decides how much XP is awarded.

## Initial data model

These tables cover the MVP. Better Auth creates and owns its own user, session and account tables; our `profile` table extends that user with game data.

| Table | Key fields | Purpose |
| --- | --- | --- |
| profile | user_id, username (citext: unique ignoring case), total_xp (cached), avatar_stage, weekly_target, streak_weeks, created_at | Game identity for each user |
| bodyweight_entry | id, user_id, kg, measured_on (date) | Bodyweight history. XP uses the entry in effect on the workout's date (75 kg fallback when there is none) |
| exercise | id, slug, name, muscle_group, body_part, equipment, mechanic (compound or isolation), reps_unit (reps or seconds), suggested_rest_sec, load_factor, bodyweight_ratio, is_custom, owner_id | Predefined library (seeded from `exercise-catalog.ts`, upserted by slug); custom exercises via owner_id. Tuning values are sent to the app for display; the server recomputes |
| exercise_preference | user_id, exercise_id, rest_sec | The player's own choices per exercise (rest time first). Highest priority: preference > routine > exercise suggestion > 120 s |
| routine | id, user_id, name, created_at, updated_at | A saved plan |
| routine_exercise | id, routine_id, exercise_id, order, target_sets, target_reps, rest_sec | The plan's exercises. A workout COPIES these when it starts, so editing a routine never changes history |
| workout | id, user_id, client_id (unique per user), routine_id (optional link; cleared if the routine is deleted), name, started_at, finished_at | One gym session; client_id makes "Finish" safe to retry. History is ordered by started_at |
| workout_exercise | id, workout_id, exercise_id, order, rest_sec | Which exercises were done, in order (exercises in history can't be deleted) |
| workout_set | id, workout_exercise_id, reps, weight_kg, set_order, completed_at, is_flagged, flag_reason | Each set performed. weight_kg is per dumbbell for dumbbell lifts and added weight for bodyweight exercises; plank logs seconds in reps for now |
| xp_event | id, user_id, amount, source, source_id, body_part, created_at | The XP ledger: one row per XP gain (one per completed set for workout XP). Unique on (source, source_id), so a repeated request can never award XP twice |
| avatar_stage | level_required, name, asset_key | Growth stages of the avatar, stored as data |
| cosmetic | id, slot, name, unlock_rule | Later: unlockable items (hair, outfit, pose) |

**XP source (decided for Milestone 3, can change later):** volume. Workout XP comes from sets × reps × weight, plus a bonus for hitting the weekly training target that grows with a weekly streak. So no exercise is penalised for its natural load, each set uses an effective load: weight + (bodyweight × the exercise's bodyweight_ratio), multiplied by the exercise's load_factor. A push-up counts part of your bodyweight, a pull-up counts all of it, and a light isolation lift like a lateral raise gets a higher load_factor so a hard set earns about as much as a hard squat set. Both values are tuned per exercise in the database. Later, training several muscle groups earns more than repeating one.

## XP & level system

Level is never stored as truth: it is calculated from total XP, so the curve can be rebalanced at any time. The starting curve makes each level take a little longer than the last:

```
XP to reach level n = 100 × (n − 1)^1.5
```

That puts level 2 at 100 XP, level 5 at 800 XP, level 10 at 2,700 XP and level 20 at about 8,300 XP. These numbers are a first guess to tune once real workouts are logged.

- **Where XP comes from:** workout volume plus a weekly consistency bonus and streak (MVP); muscle-group variety, quests and achievements later, each as a new `source` in the ledger.
- **XP per completed set** = round(reps × effective kg / 10), where effective kg = (kg + bodyweight × `bodyweight_ratio`) × `load_factor`. Bodyweight is the entry in effect on the workout's date (75 kg if none). A 0 kg pull-up therefore still earns XP. This is one function in `packages/shared`, so it is easy to swap.
- **Personal records** (calculated on read from logged sets): estimated 1RM by Epley, kg × (1 + reps / 30), on effective kg; a single rep counts as the weight lifted. Sets above 12 reps don't count toward estimated-1RM PRs; they are tracked as "most reps at a weight". Timed exercises (plank) use the longest hold. Bodyweight sets are shown as "BW + x kg".
- **Coach hint** (fixed rules, no AI): double progression. Raise the weight only when every set hit its target reps last time; the increment is configured per equipment type (default +2.5 kg barbell and machine, +1 kg per dumbbell).
- **Who calculates it:** the progression service on the server, in the same database transaction that saves the workout. The app runs the same shared functions only to show live XP, PRs and hints during a workout; the server recomputes and is the only one that awards anything.
- **Where the formula lives:** `packages/shared`, with unit tests, so app and server agree on level boundaries.
- **Level-up moment:** the "Finish workout" response returns XP gained, old level and new level, so the app can play the level-up screen without a second request.

**Limits against fake or inflated workouts** (values to tune later):

- **Daily soft cap:** full XP up to a daily limit, then 25% XP beyond it, with a hard ceiling at twice the limit. A soft cap rewards a genuinely big day without making a fake 1,000-pull-up day worth it.
- **Plausibility checks per set:** reps or weight far beyond a realistic range for that exercise earn no XP and are flagged instead of rejected, so honest typos can be fixed.
- **Special events later:** marathons and other big efforts get their own XP source with its own limits, rather than raising the daily cap for everyone.
- **Server-side only:** all caps run in the progression service, so they can be tuned without an app update.

## Avatar prototype: a stickman that grows

The first avatar is a stickman drawn in code with `react-native-svg`. No art assets are needed, and growth is just numbers: limb thickness, shoulder width and head size change with the stage. Later we can swap the renderer for layered 2D art (and possibly 3D after that) without changing the data model.

**Each body part grows on its own.** Every exercise belongs to a body part (chest, back, shoulders, arms, core, legs), and its XP also counts toward that part. Skip leg day and the stickman's legs stay thin while the arms grow. The overall level and stage below still come from total XP; the body parts decide the shape.

- Body-part XP is tracked in the ledger (`xp_event.body_part`) with a cached total per part, so it can be rebalanced like overall XP.
- The avatar takes one development value per body part (for example 0 to 1) and draws each limb from it. The same values will drive the layered 2D or 3D art later.
- To encourage balanced training, the home screen points out the weakest body part, and the later variety bonus gives extra XP for training neglected parts.

| Stage | Unlocks at | Look |
| --- | --- | --- |
| Rookie | Level 1 | Thin lines, narrow shoulders |
| Regular | Level 5 | Thicker limbs, slightly wider shoulders |
| Athlete | Level 10 | Broad shoulders, chest and arm shapes appear |
| Champion | Level 15 | Full build plus a headband |
| Legend | Level 20 | Full build plus a cape and a glow |

- The `Avatar` component takes a stage config (stroke width, shoulder width, extras), never a level, so the art and the rules stay separate.
- Stage thresholds live in the `avatar_stage` table and can be tuned without a release.
- A small growth animation plays on the level-up screen when the stage changes.

## Production readiness plan

These are designed in from day one but switched on when the milestone needs them, so none of them slows down the first build.

| Concern | Approach | When |
| --- | --- | --- |
| Code quality | ESLint, Prettier, strict TypeScript | Milestone 1.5 |
| CI | GitHub Actions: type check, lint and tests on every push | Milestone 1.5 |
| Tests | Vitest unit tests for pure logic (XP formula, shared schemas); Jest (`jest-expo`, as Expo recommends) for the app's workout and outbox logic; API integration tests with Supertest against a real Postgres test database (`levelup_test`, wiped before each test; CI uses a Postgres service container) | From Milestone 2 |
| Config and secrets | `.env` files validated at startup with Zod; never committed | Milestone 1.5 |
| Errors and crashes | Sentry in the app and the API | Before beta |
| Hosting | API in a Docker container on a managed host; managed Postgres with backups | Before beta |
| App builds | Expo EAS builds, store submission, over-the-air updates | Before beta |
| Security | Rate limiting on auth routes, Helmet headers, input validation on every route | Milestone 2 onwards |

The hosting provider is still open; the shortlist is Render, Railway or Fly.io for the API, and Neon or Supabase for Postgres.

## Roadmap & milestones

Each milestone ends in something that runs end to end on a phone, not a pile of half-built layers.

1. **Design the core screens.** Mock up avatar creation, home (avatar + level + XP bar), log workout, and the level-up moment.
   - Done when: the four screens are agreed and the data each one needs is listed.
2. **Foundation.** Monorepo, Docker Postgres, Prisma, Express API, Expo app, lint and CI.
   - Done when: the phone calls `GET /health`, the API reads from Postgres, and CI is green.
3. **Authentication.** Register, log in, log out, session kept across restarts, profile created on sign-up.
   - Done when: a new user signs up on the phone and lands on an auth-guarded home screen.
4. **Workout logging.** Exercise library, start a workout, add sets offline, finish with a safe retry.
   - Done when: a workout logged in airplane mode saves exactly once after reconnecting.
4c. **Routines and active workout.** Saved routines (list, detail, builder), the active workout screen with a rest timer and notification, estimated 1RM and PRs, XP per set written to the ledger, the workout summary and exercise history. Pulls the XP ledger and PRs forward from Milestone 5.
   - Done when: starting a routine pre-fills the active workout, the rest timer is correct after the app was in the background, and Finish shows XP earned and new PRs, saved exactly once.
5. **Progression.** Level-up screen, weekly-target and streak bonuses, daily XP cap (the ledger, level formula and XP bar arrive in 4c).
   - Done when: finishing a workout shows XP gained and, when earned, a level-up.
6. **Stickman avatar.** Growth stages driven by level, body parts driven by body-part XP.
   - Done when: the avatar visibly changes at levels 5, 10, 15 and 20, and untrained body parts stay thin.
7. **Beta readiness.** Hosting, Sentry, EAS builds, testers on TestFlight and Google Play internal testing.
   - Done when: five real people use it at the gym for two weeks.

Later, not yet scheduled: **session backup sync**, an idempotent `PUT /sessions/:clientId` that uploads the whole in-progress session every minute or so. It protects against a lost phone and gives the server its own receive times, which the anti-cheat checks need (sets far above the player's history, or completed implausibly fast, get `is_flagged`, earn no XP and don't count as PRs until confirmed).

After the beta: variety bonus, quests, achievements, the rules-based coach, cosmetics, then leaderboards and social features.

## Decision log

Newest first.

| Date | Decision | Trade-off accepted |
| --- | --- | --- |
| 2026-11-11 | Milestone 4c: routines and the active workout, pulling the XP ledger and PRs forward from Milestone 5 | A bigger milestone; the core loop (log, earn XP, see progress) works end to end sooner |
| 2026-11-11 | Stay local-first: the session lives on the phone and is sent whole at Finish through the outbox, now with each set's completed_at and rest_sec. Backup sync (`PUT /sessions/:clientId`) is a later milestone | Nothing reaches the server mid-workout, so a lost phone loses that session; no per-set sync protocol or half-finished sessions on the server |
| 2026-11-11 | Progression maths (XP, estimated 1RM, PRs, coach hint, rest priority) are pure functions in `packages/shared`; the app uses them for live display, the server recomputes at Finish. `load_factor` and `bodyweight_ratio` are now sent to the app (supersedes the 2026-11-10 "server-only" decision) | Tuning values are public; harmless, because the client's numbers are never trusted |
| 2026-11-11 | XP per set = round(reps × effective kg / 10), effective kg = (kg + bodyweight × bodyweight_ratio) × load_factor | Needs bodyweight; bodyweight and light exercises are no longer penalised |
| 2026-11-11 | Bodyweight is a dated history (asked at sign-up); XP uses the value in effect on the workout's date, 75 kg if unknown | One more table and a lookup; old workouts keep their XP when bodyweight changes |
| 2026-11-11 | Estimated-1RM PRs on effective kg, single rep = weight lifted, sets above 12 reps excluded (tracked as most reps at weight), plank = longest hold | Several PR kinds to show; no misleading 1RMs from high-rep sets |
| 2026-11-11 | Coach hint uses double progression with increments configured per equipment type | Conservative suggestions; no AI, fully predictable and testable |
| 2026-11-11 | The player's rest time per exercise is stored on the server (`exercise_preference`), written at Finish | Saved only when a workout is finished; follows the player to a new phone |
| 2026-11-11 | `xp_event` is unique on (source, source_id), one event per completed set | Many ledger rows; a repeated request can never award XP twice, and each row carries its body part |
| 2026-11-11 | Keep the names Workout / WorkoutExercise / WorkoutSet (not Session / Set) | Names differ from the spec's wording; no migration churn, and `Set` would hide JavaScript's built-in Set type |
| 2026-11-11 | Exercise filters use the six body parts; search still matches muscle-group text | Coarser filter; fits a phone width and matches the avatar's body parts |
| 2026-11-10 | App state persists to `expo-sqlite/kv-store` with its synchronous API | A tiny write on the JS thread per change; state restores before the first render and is on disk the moment Finish returns |
| 2026-11-10 | Outbox: oldest first, one at a time; network errors, 5xx, 401, 408 and 429 retry with backoff (2 s doubling to 5 min, +/-20% jitter); other 4xx stop as "needs attention" | A retrying workout holds the ones behind it; order is kept for XP and streaks, and one rejected workout never blocks the rest |
| 2026-11-10 | Finish sends only completed sets; a workout left open past 6 hours ends at its last completed set | Unticked sets are dropped silently; a forgotten Finish still saves instead of being rejected for good |
| 2026-11-10 | The exercise list is cached on the phone by hand (not TanStack's persister) and re-validated with the shared schema on read | A little custom code; no extra packages, and an outdated cache is discarded instead of crashing |
| 2026-11-10 | Exercises carry `repsUnit` so the app labels timed exercises from data, not names | One more column; custom timed exercises will just work |
| 2026-11-10 | Send the whole workout once, at Finish (not set by set) | Nothing reaches the server until Finish, so a lost phone loses the session in progress; in exchange, one simple request, no half-saved workouts and no sync protocol |
| 2026-11-10 | Finish is idempotent by `clientId`, unique per user; a repeat returns 200 with the first saved version | A retry carrying edited data is ignored; a global key would have let one user's retry return another user's workout |
| 2026-11-10 | Personal records (best set, estimated 1RM) are calculated on read from logged sets, never stored | Reads do more work as history grows (cache it later if needed); records can never drift from the sets, and changing a formula needs no data migration |
| 2026-11-10 | Workout history uses keyset (cursor) pagination on (started_at, id), newest first | Can't jump to "page 7"; pages never shift or repeat when late-synced workouts arrive, and stay fast at any depth |
| 2026-11-10 | Built-in exercises live in code (`exercise-catalog.ts`) and are seeded by slug upsert; `loadFactor`/`bodyweightRatio` are server-only | Retuning needs a deploy + seed run (not an admin UI yet); values are reviewed in Git and never exposed to clients |
| 2026-11-10 | Modules use each other's services, never tables (workouts asks exercises.service to check exercise ids) | One extra query when reading a workout; modules keep their storage private |
| 2026-11-10 | API tests run against a real Postgres test database, no Prisma mocks; test files run one at a time | Slower tests that need Docker; they catch real SQL, constraint and migration bugs that mocks would hide |
| 2026-11-10 | Usernames unique ignoring case (Postgres `citext`), letters, digits and `_` only | Postgres-specific column type; no impersonation by case or look-alike characters |
| 2026-11-10 | Services throw `AppError` (kind + code); one error handler maps it to HTTP | One more small abstraction; services stay HTTP-free and the app branches on stable codes |
| 2026-11-08 | Each body part grows from its own XP | More data to track; avatar reflects real training balance |
| 2026-11-08 | Daily XP soft cap and per-set plausibility checks | Rare genuine huge days earn less; fake workouts stop paying off |
| 2026-11-08 | XP from volume with per-exercise load_factor and bodyweight_ratio, plus weekly streak bonus | Per-exercise tuning work; no exercise is penalised for its natural load |
| 2026-11-08 | Stickman avatar drawn in code for the prototype | Less visual appeal now, in exchange for zero art work and a fast loop |
| 2026-11-08 | Better Auth inside our own API | More to set up than a managed service; no vendor lock-in and more learning |
| 2026-11-08 | XP stored as a ledger; level derived from XP | Slightly more complex queries; full history and easy rebalancing |
| 2026-11-08 | Server owns all XP and level rules | Every award needs a network call; no client-side cheating |
| 2026-11-08 | Offline-tolerant logging with idempotent "Finish" | Sync logic to build; works with bad gym signal |
| 2026-11-08 | Modular monolith instead of microservices | One deployable unit to scale; far less operational work |
| 2026-10 | Restart on React Native + Expo, Node + Express, PostgreSQL + Prisma | Lose the Flutter + Firebase progress; gain one language, a relational model and our own backend |
| 2026-08 | Rules-based coach for the MVP, no AI | Less "smart"; predictable, testable, free to run |
