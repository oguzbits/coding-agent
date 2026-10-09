# Backlog

State, open items and later ideas. The plan itself is in [PLAN.md](PLAN.md).

## Done

- Slice 1: spike with Flash-Lite, see [SPIKE-ERGEBNISSE.md](SPIKE-ERGEBNISSE.md)
- Slice 2: NestJS scaffold (config, Postgres, migrations proven in ESM, logs with request ids, host/origin check, checks, hooks)
- Slice 3: accounts (register, login, logout, change password, profile with encrypted Gemini key)
- Slice 8: confirm email and reset password (single-use hashed tokens, `MailSender` port with a logging default), unconfirmed accounts cannot start runs (`REQUIRE_EMAIL_CONFIRMATION`), list and end own logins, delete account; web pages and settings sections for all of it
- Slices 4–6b: agent loop with SSE, Gemini adapter, project files and clone, file tools with approval and modes, run_command
- Slice 7b: Playwright end-to-end paths (sign up, approval, file view; reload during a run) against the real API with the fake provider, `npm run e2e` (needs `npm run db:up`; uses database `coding_agent_e2e`)
- Slice 7a: web app (Vite, React, Tailwind, OpenAPI types), sign-in, start page, chat with live steps, files panel, settings
- Slice 0: name, `.nvmrc`, `.gitignore`, README, AGENTS.md/CLAUDE.md, hooks for Claude Code

## Next

- Slice 7b rest: comparison against the template (`docs/DESIGN-ABGLEICH.md`), collapsed action groups, collapsed sidebar
- Slice 9: operations (metrics, traces, health checks, k6 load tests, decision on several instances)

## Open

- CI workflow (`.github/workflows/ci.yml`, now with an `e2e` job) exists locally but is not pushed: the GitHub token lacks the `workflow` scope.
  Fix: `gh auth refresh -h github.com -s workflow`, then remove `.github/workflows/` from `.git/info/exclude` and commit it.

- `.npmrc` sets `legacy-peer-deps=true` because `openapi-typescript` still declares a peer range without TypeScript 6; drop it
  once a release supports it.
- ZIP download uses `yazl` (small, streaming) instead of the `archiver` named in the plan.
- The per-user storage limit is checked when cloning only, not for files the agent writes.
- `ActiveRunDto.pendingApproval` is nullable in the API but typed as required in the OpenAPI document.
- A clone keeps running when the client disconnects (it is not tied to the request).
- Assistant text is shown as plain text; Markdown rendering is open.
- 429 response body (minute vs. day limit, wait time): measure in slice 5
- Several tool calls in one response; thought tokens against the minute limit
- Harder tasks than the spike (larger repos, unclear failures)
- Whether the Gemini key shares a Google project with other keys (shared 500 requests per day)

- Profile: model name and limits as HTTP endpoints (service method `setModelName` exists) arrive with the Gemini adapter (slice 5)
- No real mail provider yet: `LogMailSender` writes mails to the log. Add an SMTP/API adapter behind `MailSender` before opening registration.
- The list of logins shows creation time and device, not the last activity (connect-pg-simple stores only the expiry).
- No automated cleanup of expired `account_tokens` rows (they are small; a daily DELETE job is enough).

## Later

- Everything under "after the MVP" in the plan
