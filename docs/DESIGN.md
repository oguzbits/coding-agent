# Design tokens

The web app (`apps/web`) follows the look of OpenHands v1.25.0 (MIT, see [../THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)).
All values live as CSS variables in `apps/web/src/styles/index.css` and are exposed to Tailwind through `@theme inline`.

| Tailwind name      | Dark (default) | Light               | Use                                |
| ------------------ | -------------- | ------------------- | ---------------------------------- |
| `base`             | #181818        | #ffffff             | page background                    |
| `surface`          | #202020        | #f3f3f3             | sidebar, cards, composer           |
| `raised`           | #282828        | #eeeeee             | raised panels                      |
| `deep`             | #101010        | #e8e8e8             | code and diff blocks               |
| `foreground`       | #ececec        | #1f1f1f             | text                               |
| `muted`            | #979797        | #616161             | secondary text                     |
| `line`             | #404040        | #d4d4d4             | borders                            |
| `line-subtle`      | #313131        | #e5e5e5             | dividers                           |
| `hover` / `active` | #313131        | #e5e5e5 / #e8e8e8   | row states                         |
| `contrast`         | #ffffff        | #1f1f1f             | primary button, send button        |
| `primary`          | #c9b974        | #007acc             | accents                            |
| `danger`           | #e76a5e        | #d13438             | errors, removed lines              |
| `success`          | #1fbd53        | #16825d             | added lines, done                  |
| `plan` / `plan-line` | #4a67bd / #597ff4 | same           | plan mode                          |

Fonts: Outfit (text) and IBM Plex Mono (code), self-hosted through `@fontsource`. Dark is the default; the light set applies
when the system asks for it or `data-theme="light"` is set on `<html>`.

Layout measures taken from the template: sidebar 300px, header row 40px, list rows 36px, chat column max 800px, composer
`rounded-[15px]` with 16px padding, round 32px send button.

Not yet done: collapsible "N actions completed" groups, collapsed sidebar (60px), side-by-side comparison against the
rendered template (see BACKLOG).
