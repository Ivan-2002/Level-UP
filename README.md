# Level-UP
LevelUp is a gamified fitness application that transforms your fitness journey into an RPG-style experience. Users earn XP by completing workouts, level up their avatars, unlock rewards, and track their fitness progress while staying motivated through gamification.

## Development tools

### Grant test XP (`dev:grant-xp`)

Level-ups take weeks of real training, so in development you can add XP to a test account by hand:

```sh
pnpm --filter api dev:grant-xp <email> <amount>
# e.g. pnpm --filter api dev:grant-xp tester@example.com 5000
# Granted 5000 XP to tester@example.com: 5000 XP in total, level 1 -> 3.
```

- The account must exist and have created its character.
- The XP goes through the ledger like any other gain: one `xp_event` row with source `dev_grant` (outside the daily cap), plus the cached total. To find or remove test XP later, look for `source = 'dev_grant'`.
- It writes to the database in `DATABASE_URL` (the repo-root `.env`), and **refuses to run when `NODE_ENV` is `production` or when `DATABASE_URL`'s host isn't local** (`localhost`, `127.0.0.1` or the Docker Compose service `db`), so a `.env` pointed at a hosted database can't be granted XP by mistake.
- The app shows the new level (and the level-up screen) the next time it loads the profile: open Home, or pull the app to the foreground.
