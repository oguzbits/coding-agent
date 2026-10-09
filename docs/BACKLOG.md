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

- Slice 7b rest: compare light theme and chat view with OpenHands (see [DESIGN-ABGLEICH.md](DESIGN-ABGLEICH.md))

## Open

- Load tests: stress to the breaking point, endurance run, then set thresholds; add a `load-smoke` job to the (unpushed) CI workflow.
- Mails go out only when `MAIL_API_KEY` and `MAIL_FROM` are set (Resend HTTP API, tested offline with a stubbed `fetch`;
  not tried against the real provider). Without them production logs recipient and subject only.
- No span for the HTTP request itself (auto-instrumentation does not hook into ESM reliably); spans cover run, model call and tool call.
- The SSE channel gauge has no HTTP test; the gauge itself is unit-tested.

- CI workflow (`.github/workflows/ci.yml`, now with an `e2e` job) exists locally but is not pushed: the GitHub token lacks the `workflow` scope.
  Fix: `gh auth refresh -h github.com -s workflow`, then remove `.github/workflows/` from `.git/info/exclude` and commit it.

- `.npmrc` sets `legacy-peer-deps=true` because `openapi-typescript` still declares a peer range without TypeScript 6; drop it
  once a release supports it.
- ZIP download uses `yazl` (small, streaming) instead of the `archiver` named in the plan.
- 429 response body (minute vs. day limit, wait time): measure in slice 5
- Several tool calls in one response; thought tokens against the minute limit
- Harder tasks than the spike (larger repos, unclear failures)
- Whether the Gemini key shares a Google project with other keys (shared 500 requests per day)

- The list of logins shows creation time and device, not the last activity (connect-pg-simple stores only the expiry).

## Later

- Everything under "after the MVP" in the plan
