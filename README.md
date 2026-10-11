# Commit Watch

Commit Watch is a local dashboard for reviewing weekly GitHub contribution activity across public repositories. It runs as a Next.js Node app and stores data in a SQLite file on your computer.

## Requirements

- Node.js `>=22.13.0`
- npm

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app listens on loopback, so it is available only from this computer. Use **Run now** to create a report; scans are not scheduled automatically.

The SQLite database is created at `data/commit-watch.sqlite`. Set `DATABASE_PATH` in `.env.local` to choose another location. Back up this file to preserve repositories, roster, settings, cached commit details, and reports.

## Optional integrations

Public repositories work without a GitHub token. To raise GitHub's API rate limit, set `GITHUB_TOKEN` in `.env.local` to a token that can read public repositories. The token stays on the server and is never sent to the browser.

For alert emails, set `RESEND_API_KEY`, `EMAIL_FROM`, and optionally `APP_BASE_URL` in `.env.local`. Email delivery remains disabled until an alert address is saved in Settings.

## Development commands

- `npm run dev`: start the local app
- `npm run db:migrate`: create or update the local SQLite schema
- `npm run db:generate`: generate a Drizzle migration after changing the schema
- `npm run typecheck`: check TypeScript
- `npm run lint`: run ESLint
- `npm test`: run unit tests
- `npm run build`: build the production app
- `npm start`: serve the production build on `127.0.0.1:3000`

After changing the schema, generate a migration, then run `npm run db:migrate`. Keep the local `data/` directory private and do not commit its database files.
