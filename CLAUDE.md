# Career Goals

A goal and daily task tracker. Vite + React 19 + TanStack Query on the front end, Express 5 + Mongoose on the back, one MongoDB database. Both halves live in one package. `README.md` has the full reference: domain model, screens and API.

## Rules

- Never install anything (npm/yarn packages, global tools, system dependencies, etc.) without asking and getting explicit confirmation first.
- Do not run Playwright or any similar browser-automation/testing tool on your own initiative, especially if it requires installing something. Never install or invoke these without being asked.
- When asked to do a task, just do the task. Do not perform your own verification testing in the browser (manual or automated) unless explicitly asked to.
- Do not put personal data in this repo: no real names, emails, credentials, health records or employment documents, in code, comments, seeds or docs. `.env` and `server/backups/` are gitignored and stay that way.

## Workstation setup

Requirements: Node.js 20.19+ or 22.12+, Yarn 1.22+, and Docker or another MongoDB 6+.

Run these from this folder. `yarn install` needs the user's confirmation, per the rules above.

```bash
yarn install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
docker compose up -d        # MongoDB on host port 27019
yarn dev                    # migrations, then the API on :4000 and Vite on :5173
```

- App: http://localhost:5173
- API health check: http://localhost:4000/api/health should report `"db":"connected"`.
- Optional demo data: `yarn seed` (only runs against an empty database).

Confirm these on each new machine:

- **MongoDB:** without Docker, point `MONGODB_URI` in `.env` at an existing MongoDB or Atlas, keeping the `/careergoals` database name. Check the URI before running `yarn dev`, `yarn migrate` or `yarn seed`, because they all act on whatever it names.
- **Git identity:** run `git config user.name` and `git config user.email` in this repo and check they show the work identity before committing.
- **Ports:** if 4000, 5173 or 27019 are taken, change `PORT` and `CLIENT_ORIGIN` in `.env`, or the port in both `docker-compose.yml` and `MONGODB_URI`.

## Commands

| Command | What it does |
| --- | --- |
| `yarn dev` | Runs pending migrations, then both servers |
| `yarn build` | Typechecks all TS projects and builds the client to `dist/` |
| `yarn typecheck` | `tsc -b` across client, Vite config and server |
| `yarn lint` | ESLint over the repo |
| `yarn migrate` | Applies pending migrations, backing up first |
| `yarn db:backup` / `yarn db:restore` | Dumps to `server/backups/`, or restores from it (no args lists backups) |
| `yarn seed` | Inserts demo data into an empty database (`--force` wipes existing data first) |

## Layout

- `src/`: React client (`routes/`, `components/`, `hooks/`, `api/`, `lib/`).
- `server/src/`: Express API (`routes/`, `controllers/`, `models/`, `migrations/`, `lib/`).

## Conventions

- **The database is the source of truth.** Seeding never overwrites existing data unless forced, and writes that could lose data take a backup first.
- **Migrations** are numbered files in `server/src/migrations/`, listed in `registry.ts`. They have no `down()`; the backup taken before they run is the rollback.
- **Dates** are local calendar days stored as `YYYY-MM-DD`, not UTC timestamps.
- **Some types and rules are duplicated by hand** between client and server. `README.md` lists the pairs to keep in sync.
