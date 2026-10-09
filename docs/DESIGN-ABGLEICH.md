# Design comparison with OpenHands

Measured on 2026-10-09 in Chrome DevTools against the running OpenHands app (`app.all-hands.dev`, dark theme, start page).
Only computed styles were read. This is the first measured pass; the earlier plan item "measure instead of guess" had not
been done before.

## Matches

| Element | OpenHands | Here |
| --- | --- | --- |
| Message box | `bg-surface`, radius 15px, padding 16px, no border | same |
| Message box on focus | no outline, border or shadow | fixed (see below) |

## Fixed

- Thick white ring around the message box on focus: the global `:focus-visible` rule was unlayered CSS and therefore beat
  Tailwind's layered `focus-visible:outline-none`. It now lives in `@layer base`. Buttons and links keep the 2px keyboard ring.

## Deviations (not changed yet)

| Element | OpenHands | Here |
| --- | --- | --- |
| Font | system stack (`-apple-system`, SF Pro, Segoe UI, ...) | Outfit |
| Base text size | 16px | 14px |
| Start page heading | 32px, weight 500, plus a one-line subtitle | 24px, no subtitle |
| Sidebar | 300px wide, search field, "New Chat", "Customize", "Automate" | different structure |
| Page background | `rgb(24, 24, 24)` | to be measured against `--oh-background` |
| Chips below the message box | pill, 1px border `rgb(64, 64, 64)`, padding 4px 10px | not present |

The light theme and the chat view (message bubbles, action rows) have not been compared.
