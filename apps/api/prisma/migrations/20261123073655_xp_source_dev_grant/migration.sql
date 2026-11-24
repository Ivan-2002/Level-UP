-- dev_grant: test XP added by hand in development (`pnpm --filter api dev:grant-xp`), so
-- level-ups can be tested without logging weeks of workouts. Its own source keeps those
-- rows apart from earned XP: easy to find, and outside the daily cap.
-- ADD VALUE only appends to the type: no existing xp_event row is touched.
ALTER TYPE "xp_source" ADD VALUE 'dev_grant';
