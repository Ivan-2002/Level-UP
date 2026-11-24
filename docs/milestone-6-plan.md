# Milestone 6 plan: the stickman avatar

_Status: **proposal, waiting for review** (2026-11-24). No Milestone 6 code until it's approved. Once approved, the rules move into `docs/ARCHITECTURE.md` (Avatar prototype, data model, decision log) and this file is deleted._

The decisions Ivan already made (art approach, look, contract, pure drawing function, UI preview, Home hero, level-up animation) are recorded in `docs/ARCHITECTURE.md`. This file proposes what those decisions left open.

All numbers below come from a prototype that runs the simulated players (`packages/shared/simulation/players.ts`) through the real shared scoring (`scoreSessionSets`). PR 6a turns it into a permanent table in `pnpm --filter @levelup/shared sim`, with tests.

---

## 1. Development from XP

### Proposal: grow from hard sets, not from kilograms

A part's development grows from its **training dose**: the number of hard sets it got that week, as recorded in the ledger. It doesn't grow from the raw XP of those sets.

- **Each set's growth stimulus is its effort** (0 to 1, already calculated by `scoreSessionSets`). A hard set is 1 and an easy set is its effort, for example 0.4. Warm-ups, flagged sets and sets beyond the 10-set limit count 0. Timed sets count 1, as in effort.
- **It's stored on the ledger row:** a new column, `xp_event.stimulus` (numeric, 0 to 1 for `workout_set` rows, 0 for bonuses). Finish writes it next to `amount` and `body_part`. So "shape comes only from the body-part rows of the ledger" still holds. Milestone 7's correction rows can carry a signed stimulus the same way they carry signed XP.
- **Why not XP itself:** XP is effort × strength, so a strong lifter's set is worth about three times a beginner's set. Development built on XP would make beginners grow slowest, which is the opposite of what we want and the opposite of real life. With hard sets, a beginner's hard set counts the same as an advanced lifter's. That's what "relative" means here. The prototype's legs column, with XP scaled so an intermediate is unchanged:

| Player | Hard sets (proposal): weeks to 0.25 / 0.5 / 0.9 | Raw XP: weeks to 0.25 / 0.5 / 0.9 |
| --- | --- | --- |
| Beginner 75 kg, 2×/wk | 14 / 33 / 108 | 25 / 54 / 162 |
| Heavy beginner 110 kg, 2×/wk | 10 / 22 / 73 | 20 / 44 / 130 |
| Bodyweight-only, 3×/wk | 11 / 26 / 85 | 16 / 37 / 121 |
| Intermediate 80 kg, 3×/wk | 8 / 19 / 62 | 9 / 22 / 70 |
| Advanced 90 kg, 4×/wk | 8 / 18 / 58 | 8 / 18 / 59 |

### The curve

For each body part, a progress value `p` from 0 to 1 is walked week by week (Monday to Sunday, local weeks like the weekly goal):

```
dose D      = sum of the part's stimulus that week
response    = 1 − e^(−D / 8)            // diminishing returns per week: 6 sets 0.53, 10 sets 0.71, 20 sets 0.92, 40 sets 0.99
p_next      = p + (1 − p) × 0.04 × response   // saturating: each week closes up to 4% of the gap to 1
development = start + (1 − start) × p   // start = starting shape (section 3), 0 for most players
```

- **Saturating twice:** per week (volume beyond about 20 hard sets adds almost nothing) and over time (the closer to 1, the slower).
- **Visible from the first session:** at development 0 a part is a single line, and above 0 it's an outlined shape. So the first session that trains a part turns its line into a (thin) muscle. That's the early change a beginner sees, even though the number is small (0.02 to 0.04).
- **The current week counts as it fills up**, so a part grows as soon as a workout is saved, and the summary can show it.
- Constants (`DEVELOPMENT` in `packages/shared/src/development.ts`): rate 0.04, half-dose 8 sets. Tuned with the simulation and the beta like every XP constant.

### Weeks of normal training to reach 0.25 / 0.5 / 0.9 (and the value after 1 year)

| Player | Part (hard sets a week) | 0.25 | 0.5 | 0.9 | after 1 yr |
| --- | --- | --- | --- | --- | --- |
| Beginner 75 kg, 2×/wk full body | chest, back, legs (6) | 14 wk | 33 wk | 108 wk | 0.67 |
| | arms (4) | 19 | 44 | 146 | 0.56 |
| | shoulders, core (0) | stay lines | | | 0 |
| Intermediate 80 kg, 3×/wk PPL | legs (20) | 8 | 19 | 62 | 0.86 |
| | back (13) | 9 | 22 | 71 | 0.82 |
| | shoulders (10) | 10 | 24 | 80 | 0.78 |
| | chest (9) | 11 | 26 | 85 | 0.76 |
| | arms (6) | 14 | 33 | 108 | 0.67 |
| | core (0) | stays a line | | | 0 |
| Advanced 90 kg and 100 kg, 4×/wk | legs (39) | 8 | 18 | 58 | 0.88 |
| | back (21) | 8 | 19 | 63 | 0.85 |
| | chest, shoulders (16) | 9 | 21 | 68 | 0.83 |
| | arms (11) | 10 | 24 | 78 | 0.79 |
| Light 60 kg, 3×/wk | identical to the intermediate (same hard sets) | | | | |
| Bodyweight-only, 3×/wk | core (18) | 8 | 20 | 64 | 0.85 |
| | chest, back (12) | 10 | 22 | 73 | 0.81 |
| | arms, legs (9) | 11 | 26 | 85 | 0.76 |
| Rep-range switcher, 3×/wk | chest, back, legs (12) | 10 | 22 | 73 | 0.81 |
| Heavy beginner 110 kg, 2×/wk | legs (12) | 10 | 22 | 73 | 0.81 |
| | chest, back (6) | 14 | 33 | 108 | 0.67 |
| Skips legs (intermediate, push/pull only) | upper body (9-20) | 9-11 | 20-26 | 65-85 | 0.76-0.85 |
| | legs (0) | stay lines at any level | | | 0 |

What one workout changes (intermediate, legs session): week 1 0 → 0.037, week 4 0.106 → 0.139, week 12 0.337 → 0.362, week 26 0.607 → 0.622, week 52 0.852 → 0.857.

Checks the simulation will assert:

- Logging warm-up ramps changes nothing (prototype: identical weeks for beginner, intermediate and advanced).
- Untrained parts stay at their start whatever the level (a `dev_grant` to level 20 changes no development).
- **The fastest possible growth is capped.** With unlimited hard sets every week (response → 1), 0.5 takes 17 weeks, against 18-21 for the advanced players. So faking sets barely speeds up growth; the shape is bounded by time, not volume.

---

## 2. Shrinking

- **Grace:** for 14 days after the part's last trained day (a day with at least 1 stimulus for it), nothing happens.
- **Then a straight-line decline:** `p` falls by (its value when the decline began) ÷ 351 per day, so it is back at 0 (the starting shape) exactly one year after the last training: 14 days of grace plus 351 days of decline. Training again stops the decline at once, and growth continues from where it is.
- **Calculated on read** from the dated rows (`earned_on`, `stimulus`, `body_part`) up to the player's local today. No scheduled job, like the weekly goal.

Prototype, an intermediate's legs (0.857 after a year of training):

| Weeks off | Legs | Change |
| --- | --- | --- |
| 2 | 0.852 | −0.6% |
| 3 | 0.835 | −2.6% |
| 4 | 0.818 | −4.6% |
| 8 | 0.750 | −12.5% |
| 12 | 0.681 | −20.5% |
| 26 | 0.442 | −48% |
| 52 | 0 | back to the start |

The returning player (a year on, a year off, back at 70% strength) is back at 0.47 legs after 17 weeks of training again, and at 0.86 after a year.

**Cache, only if needed.** It's calculated on every read. The query is one aggregate over the player's ledger rows (per part and day: a few hundred rows for two years). The existing two-year performance test gets `GET /v1/avatar` added with the same 400 ms budget. If that budget is exceeded, the planned next step is one stored row per player and part (`progress`, `as_of_week`, `last_trained_on`, `progress_at_break`), updated at Finish, with decay applied on read from `last_trained_on`. A workout synced late into an older week triggers a recompute from the rows. This is the doc's "the value plus the date last trained".

---

## 3. Starting shape for experienced lifters

### Evaluation

Calibrating from logged lifts relative to bodyweight is the right idea: self-reported levels are free to exaggerate, and lifts at least cost a gym session to type. Three refinements came out of the prototype:

1. **Per part, not for the whole account.** Each part's window is the 14 days from the first day that part is trained. An experienced lifter who does legs in week 3 still gets a starting shape for their legs.
2. **Per-part benchmarks.** Load factors were tuned so a hard set of any exercise earns about the same XP, but not exactly the same: the intermediate's best back set (deadlift) earns 139 XP against 90 for chest, shoulders and legs. One shared benchmark would start every lifter's back at the maximum.
3. **Fully relative to bodyweight.** XP uses √(75 / bodyweight), so a 60 kg lifter who is exactly as strong for their size as an 80 kg one would start thinner (prototype: 0.17 against 0.25). The starting shape divides by bodyweight itself, so they match.

### Rule

```
ratio = best effective estimated 1RM ÷ bodyweight, among the part's sets in its 14-day window
        (effective = (kg + bodyweight × bodyweight_ratio) × load_factor, Epley, as XP uses)
r     = ratio ÷ the part's benchmark  (STARTING_SHAPE.benchmarks: the simulated intermediate's ratio per part)
start = 0.5 × clamp((r − 0.6) / 0.8, 0, 1)    // r 0.6 → 0, r 1.0 → 0.25, r 1.4+ → 0.5
```

- **Only honest-looking sets:** flagged and jump-capped sets are left out. The XP bodyweight on the set's date is used.
- **Calculated at Finish, by progression, while the window is open,** and stored in `body_part_start (user_id, body_part, start, window_ends_on)`. Finish already has the scored sets, the tuning and the bodyweight, and progression can't read workout tables on a later `GET`. The value only rises during the window, then it's frozen. It's a snapshot by nature, so storing it is the honest model; recomputing it later would let a retune move old starting shapes.
- **Starting shape only:** level, XP and stage are untouched. Everyone starts at level 1.
- **Prototype results (XP-derived, recomputed with the final rule in PR 6d):** beginners and the heavy beginner start at 0 for every part. The intermediate starts at 0.25 for each part it trains (by construction). The advanced players start at 0.46-0.5 (arms 0.29-0.32 with one benchmark, about 0.5 with per-part benchmarks). The bodyweight-only player starts at 0-0.3 (arms about 0.28, from dips). Core's benchmark can't come from the intermediate, who never trains it, so it comes from the catalog's hanging-leg-raise benchmark.
- The cap of 0.5 is what an honest intermediate reaches after about 5 months. An experienced lifter looks trained from week 1, but there is still a long way to grow.

### What could be gamed

| Trick | Effect | Bound |
| --- | --- | --- |
| Typing inflated weights in each exercise's first session (no history, so no jump cap) | A part starts at up to 0.5 | Plausibility limits; the 0.5 cap; cosmetic only. **Before avatar-stat events, the starting shape must not count as a strength stat without the trust rules (video for top positions).** |
| A low bodyweight at sign-up (the first entry and the first week are taken as typed) | A higher ratio | The 40 kg clamp, the 0.5 cap; the same known gap XP already has |
| Training a part with the exercise whose `load_factor` is too generous | That part starts higher | A tuning bug, fixed in the catalog. Open windows use the new value; frozen starts keep theirs |
| Lifting light in the window on purpose | A thinner start | Only hurts the player |
| New accounts to re-roll | Nothing | Level 1 every time |

---

## 4. API changes

**Shared types** (`packages/shared/src/avatar.ts`, `development.ts`):

```ts
developmentSchema = z.object({ chest, back, shoulders, arms, core, legs }) // each z.number().min(0).max(1)
avatarLookSchema  = z.object({ development, stage: z.string().nullable(), lean: z.number().min(0).max(1), expression: z.enum(["neutral", "proud"]).optional() })
avatarResponseSchema = z.object({
  stage: avatarStageSchema.nullable(),
  stages: z.array(avatarStageSchema),   // all five, so the level-up screen can draw the OLD stage from Home
  development: developmentSchema,
  lean: z.number(),                      // 0 until the endurance milestone
  parts: z.record(bodyPartSchema, z.object({ lastTrainedOn: z.string().nullable() })), // for "untrained for 3 weeks" hints
})
```

**Endpoints** (all under `/v1`, all additive; no `/v2` needed):

- **New `GET /v1/avatar`**, served by the progression module (it owns the ledger and the growth rule; modules own rules, not URL prefixes). It returns `avatarResponseSchema`, evaluated at the player's local today. The app caches it on the phone per player (like the profile) and refetches it when a workout syncs.
- **Finish summary and `GET /v1/workouts/:id/summary`** gain `avatar: { before: development, after: development }`, `default(null)`. "Before" is the ledger rows created before this workout's rows and "after" includes them, both evaluated at the workout's local day. So a repeated Finish returns the same numbers (the ledger-order rule the summary already follows). `stage: { before, after }` already exists.
- **The profile is unchanged** (it keeps `stage`). Development isn't added to it because `users → avatar` already exists and `progression → users`. Putting a ledger rule into the profile would make `users` depend on `progression`, a cycle. Development also changes on every Finish and with the calendar, while the profile rarely changes, so separate caching suits it.

**Database** (Prisma migrations):

1. PR 6a: `xp_event.stimulus NUMERIC(5,3) NOT NULL DEFAULT 0`, with a CHECK that `workout_set` rows are between 0 and 1. Backfill from `workout_set.xp_tag`: no tag, above_history and timed_limit 1; easy_set 0.4; anything else 0 (pre-launch test data only).
2. PR 6d: the `body_part_start` table (primary key user_id + body_part, cascades from user).

---

## 5. Phases (one PR each)

The drawing PR (6b) doesn't depend on 6a, so it can go first if you'd rather judge the look before the rules.

### 6a. Rules, API and simulation

- Shared: `development.ts` (constants, `setStimulus`, `developmentOn(days, start, today)`), the avatar contract schemas. Unit tests: monotonic in dose, saturating, grace, a straight-line decline to the start at 365 days, the current week counts.
- Simulation: `bodyPart` on `SIM_EXERCISES` (the API test that checks the copy against the catalog also checks it), a development table (weeks to 0.25 / 0.5 / 0.9, decay) in `sim`, and assertions (warm-ups change nothing, untrained parts stay at 0, the fastest growth is bounded).
- API: the `stimulus` migration and backfill; Finish writes stimulus; `GET /v1/avatar`; `avatar.before/after` on the summaries; the performance test.
- `dev:grant-xp` gains `--part <part> --sets <n> --on <date>` (a backdated `dev_grant` row with body part and stimulus, with the same local-only refusal), to stage shapes on a phone.
- **Done when:** an integration test shows a trained part growing, untrained parts staying at 0 after a `dev_grant` to level 20, and a part with only rows from 8 months ago at less than half its value. The summary's before/after is identical on a repeated Finish. `sim` prints the development table.

### 6b. Drawing and preview

- `avatarShape(development, lean)` in `apps/mobile/src/components/avatar/` returns numbers. The extras are a second pure function (`extrasShape(shape, stage)`), so the outfit fits any body. The tests are the decided ones: 0 means lines only, parts are independent, each is monotonic, the head never changes. Also `lean` 0 changes nothing.
- The `Avatar` component renders the contract, at two sizes. The screen-reader label comes from the stage name ("Your avatar, Regular stage").
- The UI preview gets an Avatar section: a slider per part (`@react-native-community/slider`, which is in Expo Go), a stage picker, an expression toggle, both themes and both sizes side by side.
- **Done when:** the shape tests pass, and Ivan has approved the look on a phone at 40 px and 220 px in both themes, including stick legs under a developed upper body.

### 6c. Home, level-up and summary

- Home hero (avatar, username, level and bar, not a Card; "Welcome back," removed), from `useAvatar`, which also works offline from the phone's copy. Create character shows the Rookie at all zeros.
- Level-up: on a stage change, draw the old stage, then the new extras pop in (Reanimated, staggered, about 600 ms) with the proud expression. Reduce motion draws the final state.
- Summary: one line per part that grew ("Legs +3%"), from `avatar.before/after`.
- **Done when (the roadmap's three checks, on a phone):** `dev:grant-xp` across 4, 10, 15 and 20 shows each stage's extras appear; a level-20 grant with no training keeps stick limbs; a part trained only 8 months ago (backdated grant) looks visibly thinner than one trained this week.

### 6d. Starting shape

- `startingShape` in shared, with benchmarks from the simulation. Finish writes `body_part_start` while a part's window is open; `developmentOn` uses it.
- **Done when:** the simulated intermediate starts at about 0.25 per trained part, the advanced players at about 0.5, and beginners at 0. Flagged and jump-capped sets can't raise it. The level is unchanged.

---

## 6. Room for endurance (no endurance code now)

Nothing in the data or the contract rules out an endurance look:

- The contract already has `lean`. `avatarShape(development, lean)` takes it, and a test pins that `lean` 0 draws exactly today's figure.
- `stimulus` means "growth stimulus", not "lifting effort". A run can write leg stimulus the same way, from its own effort rule (pace against recent pace).
- Stamina becomes its own dose: rows from an endurance source, fed into a sibling pure function, which maps to `lean`. Body parts and `stimulus` don't have to change. `xp_event.body_part` is already nullable.
- `GET /v1/avatar` sends `lean` already (always 0), so older apps won't need a new field when it starts moving.

---

## 7. Open questions for Ivan

1. **Growth from hard sets (a new `stimulus` column) instead of raw XP.** This rewords "body shape comes only from body-part XP" to "only from the body-part rows of the XP ledger". I recommend it (section 1's table is the reason). The alternative without a new column is dividing each row's XP by the player's own typical set XP; it works, but it's harder to explain and test.
2. **Development on its own endpoint, not on the profile** (the dependency cycle in section 4). Is one more request on Home acceptable? It runs in parallel and is cached on the phone.
3. **Stage extras as data.** Today the app maps a stage key to its extras in code. I recommend an `extras` column on `avatar_stage` (e.g. `["wristbands","outfit"]`, cumulative), so a new stage or extra needs no release (CLAUDE.md rule 6), and unknown extras are ignored by older apps. The contract would then carry the extras list as well as, or instead of, the key. Rive takes booleans per extra just as easily.
4. **Legend's glow replacement.** I recommend a cape filled `purpleSoft` with a `purple` outline (purple means progress, and a stage is progress) and a small star clasp, and no glow. Alternative: Legend's whole figure outlined in `purple` instead of `ink`. That's easier to spot at 40 px in a leaderboard, but it's the only stage that changes the line colour.
5. **Core for almost nobody.** 7 of the 8 honest simulated players never log a core exercise, so most players' waists would be a line forever. I recommend drawing core 0 as a narrow waist that reads as normal rather than as missing, and, later, giving squats and deadlifts a small secondary stimulus (e.g. 0.3 to core) through a new exercise field. Not in Milestone 6.
6. **Speed.** At rate 0.04, a regular 3×/week player reaches about 0.8 after one year and 0.95 after two, then barely changes. If the avatar should keep visibly growing in year 3, 0.03 stretches every number in section 1 by about a third.
7. **Muscle memory.** After a year off, regrowth is as fast as the first time. Real regrowth is faster. One rule would cover it (double rate while below the previous peak), but I'd wait for the beta.
8. **One hard set every 14 days keeps a part's shape** (it resets the grace period). That's harmless while the avatar is cosmetic. Revisit before development becomes an avatar-event stat (for example, maintenance needs 2 or more hard sets a week).
9. **Development measures training, not strength.** The competition plan lists "strength per body part (Milestone 6 development values)" as an event stat. With hard-set growth, a beginner who trains consistently matches an advanced lifter's development. That's good for avatar-stat events and wrong for strength rankings, which should use relative estimated 1RM (the starting-shape ratio) instead. To settle in the competition design, not now.
10. **No sex or strength-standard input.** The starting shape compares everyone with one benchmark per part, so a woman who is advanced for her sex would usually calibrate at intermediate or lower. I recommend accepting this for the MVP (it affects only the starting shape, capped at 0.5) and noting it for the beta. Alternatives: an optional "compare me with" setting, or lower benchmarks for everyone.
11. **40 px.** Full body with thicker strokes (my default), or a head-and-shoulders crop for leaderboard rows? Easiest to decide with the preview's side-by-side sizes in 6b.
