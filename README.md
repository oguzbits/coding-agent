# coding-agent

A coding agent in the browser. You give it a project and a task; it reads, searches and edits files and runs commands in
steps, and you see every step and approve each change that writes. Functionally it follows Claude Code on the web
(claude.ai/code). The web UI follows the one of [OpenHands](https://github.com/OpenHands/OpenHands) (MIT); this project is not
affiliated with OpenHands or Anthropic.

- Backend: NestJS on Node.js 24, Postgres, TypeORM
- Frontend: React, Vite, Tailwind
- Model: Gemini API (free tier), every user brings their own key

## Status

Planning and groundwork. The binding plan is [docs/PLAN.md](docs/PLAN.md), the current state and open items are in
[docs/BACKLOG.md](docs/BACKLOG.md). Measurements for the model choice: [docs/SPIKE-ERGEBNISSE.md](docs/SPIKE-ERGEBNISSE.md).

## Working on it

Use Node.js 24 (`nvm use`, version in `.nvmrc`). Build, test and lint commands are added with the NestJS scaffold (slice 2)
and listed in [AGENTS.md](AGENTS.md).

The hook tests for Claude Code run without installing anything: `node --test ".claude/hooks/*.test.mjs"`.
