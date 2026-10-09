# Backlog

State, open items and later ideas. The plan itself is in [PLAN.md](PLAN.md).

## Done

- Slice 1: spike with Flash-Lite, see [SPIKE-ERGEBNISSE.md](SPIKE-ERGEBNISSE.md)
- Slice 2: NestJS scaffold (config, Postgres, migrations proven in ESM, logs with request ids, host/origin check, checks, hooks)
- Slice 3: accounts (register, login, logout, change password, profile with encrypted Gemini key)
- Slice 9: health (live/ready), Prometheus `/metrics` (needs `METRICS_TOKEN`), OpenTelemetry spans (export with `OTEL_EXPORTER_OTLP_ENDPOINT`), k6 scenarios in `load/` (`npm run load:server`, `npm run load -- <scenario>`), results and the single-instance decision in `docs/LASTTESTS.md`
- Slice 8: confirm email and reset password (single-use hashed tokens, `MailSender` port with a logging default), unconfirmed accounts cannot start runs (`REQUIRE_EMAIL_CONFIRMATION`), list and end own logins, delete account; web pages and settings sections for all of it
- Slices 4–6b: agent loop with SSE, Gemini adapter, project files and clone, file tools with approval and modes, run_command
- Slice 7b: Playwright end-to-end paths (sign up, approval, file view; reload during a run) against the real API with the fake provider, `npm run e2e` (needs `npm run db:up`; uses database `coding_agent_e2e`)
- Slice 7a: web app (Vite, React, Tailwind, OpenAPI types), sign-in, start page, chat with live steps, files panel, settings
- Slice 0: name, `.nvmrc`, `.gitignore`, README, AGENTS.md/CLAUDE.md, hooks for Claude Code

## Next

- Slice 7b rest: close the deviations in [DESIGN-ABGLEICH.md](DESIGN-ABGLEICH.md) (first measured pass done), compare light theme and chat view, collapsed action groups, collapsed sidebar

## Open

- Load tests: stress to the breaking point, endurance run, then set thresholds; add a `load-smoke` job to the (unpushed) CI workflow.
- Review leftovers (minor): timing differences reveal whether an email is registered (register/forgot-password); change-password
  does not invalidate outstanding reset tokens and `issue()` is not transactional; change-password and account deletion are not
  in the strict throttle bucket; the approval waiter is registered after two DB writes (an early approval can get 404);
  model-supplied call ids can repeat (use server-side ids); tokens stay in the URL on confirm/reset pages; the Host check
  answers 421 for probes by IP (load balancer health checks); `authTagLength` not pinned, first-account check not atomic,
  orphaned folders when deleting during clone/run.
- Without a real `MailSender`, production logs recipient and subject only; mails are not delivered.
- A run waiting for an approval has no time limit and blocks the user's single active run.
- No span for the HTTP request itself (auto-instrumentation does not hook into ESM reliably); spans cover run, model call and tool call.
- The SSE channel gauge has no HTTP test; the gauge itself is unit-tested.

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
