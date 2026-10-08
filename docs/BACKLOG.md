# Backlog

State, open items and later ideas. The plan itself is in [PLAN.md](PLAN.md).

## Done

- Slice 1: spike with Flash-Lite, see [SPIKE-ERGEBNISSE.md](SPIKE-ERGEBNISSE.md)
- Slice 2: NestJS scaffold (config, Postgres, migrations proven in ESM, logs with request ids, host/origin check, checks, hooks)
- Slice 3: accounts (register, login, logout, change password, profile with encrypted Gemini key)
- Slice 0: name, `.nvmrc`, `.gitignore`, README, AGENTS.md/CLAUDE.md, hooks for Claude Code

## Next

- Slice 4: agent loop with fake provider and SSE

## Open

- CI workflow (`.github/workflows/ci.yml`) exists locally but is not pushed: the GitHub token lacks the `workflow` scope.
  Fix: `gh auth refresh -h github.com -s workflow`, then remove `.github/workflows/` from `.git/info/exclude` and commit it.

- 429 response body (minute vs. day limit, wait time): measure in slice 5
- Several tool calls in one response; thought tokens against the minute limit
- Harder tasks than the spike (larger repos, unclear failures)
- Whether the Gemini key shares a Google project with other keys (shared 500 requests per day)

- Profile: model name and limits as HTTP endpoints (service method `setModelName` exists) arrive with the Gemini adapter (slice 5)
- Registration answers 202 for taken emails too; the confirmation mail (slice 8) makes that usable

## Later

- Everything under "after the MVP" in the plan
