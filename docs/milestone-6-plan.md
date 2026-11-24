# Milestone 6 plan: the stickman avatar

_Status: **approved with changes** (review of 2026-11-24, answers and changes A to H below). The next commit moves these rules into `docs/ARCHITECTURE.md` and deletes this file; this version is kept in history so the review's changes can be seen as a diff._

The decisions Ivan already made (art approach, look, contract, pure drawing function, UI preview, Home hero, level-up animation) are recorded in `docs/ARCHITECTURE.md`. This file proposes what those decisions left open.

All numbers below come from a prototype that runs the simulated players (`packages/shared/simulation/players.ts`) through the real shared scoring (`scoreSessionSets`). The prototype isn't kept: **PR 6a's `pnpm --filter @levelup/shared sim` must reproduce the tables in sections 1 and 2** (weeks to 0.25 / 0.5 / 0.9, and the decay table), and its report names any difference (review G).

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
- **Drawn front-loaded (review A).** The rule isn't sped up; instead `avatarShape` maps development to size with a front-loaded curve, size ∝ development^0.6 (the exponent tuned with the preview). So 0 to 0.25 covers 44% of a muscle's growth, and a beginner's 14 weeks to 0.25 is a visibly large change. A test pins that the mapping is monotonic and that 0 is still lines only. The UI preview shows a "first 12 weeks" strip, the simulated intermediate's weekly values, to judge whether the early change is visible.
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
faceSchema = z.object({ eyes, brows, mouth, hair, skinTone })             // each a preset key; see section 6
avatarStageSchema += { extras: z.array(z.string()).default([]) }          // cumulative, from avatar_stage.extras
avatarResponseSchema = z.object({
  stage: avatarStageSchema.nullable(),
  stages: z.array(avatarStageSchema),   // all of them, so the level-up screen can draw the OLD stage from Home
  development: developmentSchema,
  lean: z.number(),                      // 0 until the endurance milestone
  parts: z.record(bodyPartSchema, z.object({ lastTrainedOn: z.string().nullable() })),
})
```

**The avatar contract** (review 3 and H; the component's input, not an API type): `development`, `extras: string[]` (instead of the stage key: the app draws the extras it knows and ignores unknown ones), `lean`, `face` and an optional `expression`. The stage name is used only for the screen-reader label. Never a level.

**Endpoints** (all under `/v1`, all additive):

- **New `GET /v1/avatar`** (approved), served by the progression module. The app caches it per player and refetches it when a workout syncs.
- **Finish summary and `GET /v1/workouts/:id/summary`** gain `avatar: { before, after }` (`default(null)`), evaluated at the workout's local day in ledger order, so a repeated Finish returns the same numbers.
- **The profile** keeps `stage` (now with `extras`) and gains `face` in 6e. Development stays off the profile (the users → progression cycle).

**Database:**

1. 6a: `xp_event.stimulus NUMERIC(5,3) NOT NULL DEFAULT 0` (CHECK 0 to 1 for `workout_set` rows; backfill from `workout_set.xp_tag`). `avatar_stage.extras TEXT[] NOT NULL DEFAULT '{}'`, filled cumulatively by the migration: Rookie `{}`, Regular `{wristbands}`, Athlete `{wristbands,outfit}`, Champion `{wristbands,outfit,headband}`, Legend `{wristbands,outfit,headband,cape}`.
2. 6d: `body_part_start (user_id, body_part, start, window_ends_on)`.
3. 6e: `profile.face JSONB NOT NULL DEFAULT '{}'`, validated by the shared `faceSchema` on write.

---

## 5. Phases (one PR each), in this order (review B)

### 6b. Drawing and preview (first)

- Pure functions in `apps/mobile/src/components/`: `avatar-shape.ts` (`avatarShape(development, lean)`, with the front-loaded size mapping), `avatar-face.ts` (presets, `resolveFace`, the face drawn with the expression) and `avatar-extras.ts` (`extrasShape(shape, extras)`: the outfit follows the body's numbers). Tests: 0 is lines only; parts are independent; each is monotonic; the size mapping is monotonic; the head never changes; `lean` 0 changes nothing; no face preset changes the head or leaves it; unknown face keys and unknown extras fall back or are ignored.
- `Avatar` renders the contract. The look: outline in `ink` at every stage; Legend's cape is `purpleSoft` with a `purple` outline (review 4); core at 0 is drawn as a normal narrow waist (review 5).
- UI preview "Avatar" section:
  - a slider per part, a stage picker (the cumulative extras the 6a migration will insert), and an expression toggle;
  - **the face: the default and one alternative per feature, with toggles** (no picker);
  - 220 px, and 40 px as a full body and a head-and-shoulders crop side by side (review 11);
  - the "first 12 weeks" strip (review A);
  - shown in both themes.
- **Done when:** the tests pass, and Ivan approves the look on a phone at both sizes in both themes, including stick legs under a developed upper body, and chooses between the full body and the crop at 40 px.

### 6a. Rules, API and simulation

- Everything in the original 6a: `development.ts`, the `stimulus` and `extras` migrations, Finish writing stimulus, `GET /v1/avatar`, `avatar.before/after`, the performance test, `dev:grant-xp --part --sets --on`.
- **Property test (review C):** over random histories (random days, parts and stimulus, crossing week boundaries and the end of the grace period), adding a set with stimulus > 0 never lowers any part's development on any day.
- **`sim` reproduces this plan's tables (review G)** and the PR reports any difference.
- **Done when:** as before (a trained part grows, untrained parts stay at 0 after a `dev_grant` to level 20, a part with only rows from 8 months ago is below half its value, the summary is identical on a repeated Finish), plus the property test and the reproduced tables.

### 6c. Home, level-up and summary

- Home hero, `useAvatar`, and the level-up's extras animation, as before.
- **Summary (review D):** a part's line appears only when it grew by at least 1 point (0.01), and the card is left out when no part did. Wording that doesn't read as a body measurement: a heading "Your avatar grew", then one row per part, "Legs" with a small bar that fills from before to after (the `purple` progress colour, as XP uses), and no percentages. Screen readers hear "Legs grew."
- **Done when:** the roadmap's three checks on a phone (extras at each stage level with `dev:grant-xp`, stick limbs at level 20 with no training, a part trained only 8 months ago visibly thinner).

### 6d. Starting shape

- As before, plus **the window line on Home (review E):** while any part's window is open, one line under the hero: "Setting your starting shape from your lifts: 9 days left" (the latest open window's days left; gone when every trained part's window has closed). It's here and not in 6c because the windows only exist from 6d.
- **Done when:** as before, plus the Home line appears for a new account and disappears after 14 days.

### 6e. Face picker (after 6c)

- The **Customize screen**, whose first section is "Face". It opens from the avatar on Home and is embedded in Create character. When the deferred cosmetics arrive (the `cosmetic` table), the same screen gains earned items next to the free ones.
- `profile.face` (above), `PATCH /v1/profile/face` (or the existing profile update), validated by `faceSchema`; the app draws `resolveFace(profile.face)`.
- The presets from section 6, each previewed live on the avatar.
- **Done when:** a player picks a face on Create character and changes it later from Home; an unknown key from a newer app falls back to the default on an older one; no preset overflows the head at 40 px.

---

## 6. The face (added by Ivan, H)

- **Slot in the contract now:** `face: { eyes, brows, mouth, hair, skinTone }`, each a preset key with a default. Unknown keys fall back to the default, so an older app never breaks.
- **Identity, not progress:** chosen by the player, free, editable any time. It never comes from level or stage; stage extras stay earned.
- **`expression` stays system-driven** (neutral; proud on the level-up; later others) and modifies the chosen face (the brow angle and the mouth). It isn't a player choice.
- **The head stays the same size.** Every preset is drawn inside the head circle, which is checked by a test, so nothing changes or overflows it at 40 px.
- **skinTone** is an optional fill for the head and hands; the default is today's outline look (filled with the background). A few tones, and no gendered preset sets. The tones are new colour tokens in `theme/tokens.ts`, the only place colours live. On a filled head, the eyes, brows and mouth are drawn in a feature colour picked per tone (at least 3:1 against it, added to `contrast.test.ts`), because `ink` is near-white in the dark theme. The outline stays `ink`.
- **Stored as slot + key** (`{ "hair": "short", "brows": "flat" }`): the same shape the `cosmetic` table will use (slot, key), so a free preset can later become a cosmetic row with an always-unlocked rule without a data migration. Basic hairstyles are free face presets; special hairstyles can be unlockable cosmetics later, in the same `hair` slot.
- **Proposed presets** (the default first; finalised in 6e with the preview):

| Slot | Presets |
| --- | --- |
| eyes | dot, round, sleepy, narrow |
| brows | none, flat, arched, thick |
| mouth | smile, line, grin, smirk |
| hair | none (the classic bald stickman), short, side part, curly, buzz |
| skinTone | none (outline only), tone 1 to tone 5 (light to dark) |

6b draws the defaults and ONE alternative per slot (round eyes, flat brows, grin, short hair, one tone), with toggles in the preview.

---

## 7. Room for endurance (no endurance code now)

Unchanged: the contract has `lean` (a test pins that 0 draws today's figure), `stimulus` means "growth stimulus" and not lifting effort, stamina becomes its own dose mapped to `lean`, and `GET /v1/avatar` sends `lean` already. The face and the extras are independent of it.

---

## 8. Answers to the open questions (review, 2026-11-24)

1. Growth from hard sets with `xp_event.stimulus`: **approved**, with the reworded rule "shape comes only from the body-part rows of the ledger".
2. `GET /v1/avatar` as its own endpoint: **approved**.
3. Extras as data: **approved**. `Avatar` takes `extras: string[]` (cumulative, from `avatar_stage.extras`) instead of the stage key; the stage name is only for the screen-reader label; unknown extras are ignored.
4. Legend: a cape with a `purpleSoft` fill and a `purple` outline, no glow; the figure's outline stays `ink` at every stage.
5. Core at 0 drawn as a normal narrow waist: **approved**. Secondary stimulus later, not in Milestone 6.
6. Rate stays 0.04.
7, 8, 10: deferred to the beta (follow-ups below).
9. One line in the competition section: development measures consistent training and isn't the strength stat for strength rankings (those use relative estimated 1RM).
11. Decided in 6b with the preview (full body and head-and-shoulders crop at 40 px, side by side).

### Follow-ups for the beta

- **Muscle memory** (7): faster regrowth while below a part's previous peak. Decide with real return-from-break data.
- **Token maintenance** (8): one hard set every 14 days keeps a part's shape. Revisit before development becomes an avatar-event stat (for example, needing 2 or more hard sets a week).
- **Sex and strength standards in the starting shape** (10): one benchmark per part calibrates most women lower. Options for the beta: an optional "compare me with" setting, or lower benchmarks for everyone.

### Milestone 7 note (review F)

Editing or deleting a set recalculates that part's starting shape **only while its window is open**; a closed window stays frozen. Correction rows carry a signed `stimulus`, like their signed XP.
