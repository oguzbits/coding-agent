# AGENTS.md

Rules for coding agents working in this repo. The plan is [docs/PLAN.md](docs/PLAN.md) and is binding; deviations are written
down in the commit message or in [docs/BACKLOG.md](docs/BACKLOG.md).

## Commands

- Node 24 (`.nvmrc`); Postgres via `npm run db:up` (Docker Compose)
- `npm run check`: format, typecheck, oxlint + ESLint, dependency-cruiser, knip (all static checks)
- `npm test`: unit tests, offline (also runs the hook tests); `npm run test:db`: tests with Postgres (`*.db.test.ts`)
- `npm run build`; migrations: `npm run migration:generate -- src/database/migrations/<Name>` in `apps/api`, then register the
  class in `src/database/migrations/index.ts`

## Layers

- `apps/api` (NestJS) and `apps/web` (React) import nothing from each other. The web app gets its types from the OpenAPI
  description.
- The agent loop knows neither HTTP nor TypeORM; it works against interfaces (`ModelProvider`, tools, policy).
- Only the Gemini adapter imports `@google/genai`.

## Invariants

- Queries are scoped to the user from the session.
- Tools run only through the policy service; paths only through the path guard.
- API keys and file contents never appear in logs.
- Environment values come only through the config module; model IDs live only there.
- Migrations are generated; `synchronize` stays off.
- Tests make no real network calls; they use the fake provider.
- Zod is used for tool schemas only; HTTP input uses DTO classes.

## Workflow

- Test first: watch the test fail, then write the code. Run the checks before saying something is done.
- Small commits on the current branch; never `--no-verify`, never force-push (hooks in `.claude/` block both).
- Never read or print `.env*` values or key files; `.env.example` is fine.
