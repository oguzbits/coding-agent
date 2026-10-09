# Adopting the OpenHands UI (option A)

Decision of 2026-10-09: the UI is taken over from the reference source instead of being rebuilt by eye, as
[PLAN.md](PLAN.md) ("UI-Vorlage") already says. Components are copied, adapted to our API and our lint rules, and listed in
`THIRD-PARTY-NOTICES.md`. Not chosen: running their frontend unchanged against a rebuilt backend API (about 625 components,
WebSocket "agent server" protocol, no accounts; every upstream change would break our API).

## Reference

- Clone: `~/Desktop/Dev/reference/OpenHands`, tag `v1.25.0`, MIT licence (one `LICENSE` at the root, no sub-licences found).
- The hosted app (`app.all-hands.dev`) uses the colour theme `openhands-neutral` (`#181818`), defined in
  `src/themes/color-theme/definitions/`. The light theme is `light-plus`. Other themes: `openhands-deepsea`, `openhands-neo`,
  `solarized-light`. The hosted app can be newer than `v1.25.0`; where they differ, the hosted app wins for looks.
- Routes worth taking: `routes/index-home.tsx`, `routes/home.tsx`, `routes/conversation.tsx`, `routes/settings*.tsx`,
  `routes/files-tab.tsx`. Components: `src/components/{sidebar,conversation,conversation-events,settings,files,shared,ui}`.
- Check against the original: `npm run dev:mock` in the clone shows the same views with sample data.

## Order of slices

1. **Foundations:** fonts (Outfit, IBM Plex Mono, self-hosted), theme registry with `openhands-neutral` and `light-plus`,
   theme switch in settings. Ruling: no HeroUI, because only 14 of the reference files import it; those few widgets are
   rebuilt with plain Tailwind in the same look.
2. **Shell and sidebar:** `root-layout`, `components/sidebar`.
3. **Start page:** `index-home` / `home` with the project picker (our "project" replaces their workspace/repo).
4. **Conversation:** `components/conversation`, `conversation-events` (messages, action rows, approval), chat input.
5. **Settings:** model/key/limits, account, sessions (ours), styled with their settings components.
6. **Files tab.**

## Rules per slice

- Copy the file, keep their structure and class names, add the notice, then replace their data layer with our hooks in
  `src/api/queries.ts`. Leave out features we do not have (automations, plugins, MCP, skills, browser tab, planner).
- Our lint limits (complexity 10, 80 lines per function) apply; split copied code where needed instead of switching rules off.
- Compare each finished view with the mock clone (screenshot and computed styles) once, as a check, not as the method.
- Tests stay offline; behaviour tests of the old components move to the new ones.

## What "copy" means in practice

The components are not self-contained. The sidebar alone is about 20 files (`components/features/sidebar`) that depend on
zustand stores, React contexts (backends, navigation), i18n keys, `#/` imports and their query hooks, so a file copy does
not compile here. Per component: read it, take the markup, class names, states and behaviour, and rewrite the wiring against
our hooks. This is slower than copying but gives the same result on screen without measuring by eye. Expect one slice to be
several commits.
