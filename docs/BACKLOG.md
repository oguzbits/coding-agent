# Backlog

State, open items and later ideas. The plan itself is in [PLAN.md](PLAN.md).

## Done

- Slice 1: spike with Flash-Lite, see [SPIKE-ERGEBNISSE.md](SPIKE-ERGEBNISSE.md)
- Slice 0: name, `.nvmrc`, `.gitignore`, README, AGENTS.md/CLAUDE.md, hooks for Claude Code

## Next

- Slice 2: NestJS scaffold (ESM migration and DB test first)

## Open

- CI workflow (`.github/workflows/ci.yml`) exists locally but is not pushed: the GitHub token lacks the `workflow` scope.
  Fix: `gh auth refresh -h github.com -s workflow`, then remove `.github/workflows/` from `.git/info/exclude` and commit it.

- 429 response body (minute vs. day limit, wait time): measure in slice 5
- Several tool calls in one response; thought tokens against the minute limit
- Harder tasks than the spike (larger repos, unclear failures)
- Whether the Gemini key shares a Google project with other keys (shared 500 requests per day)

## Later

- Everything under "after the MVP" in the plan
