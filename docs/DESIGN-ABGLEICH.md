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

## Aligned afterwards

- System font stack instead of Outfit; base text 16px in the message box; start page heading with a one-line subtitle.
- Message box as a column (text, then toolbar with mode picker and a round send/stop button); project picker as a pill.
- Sidebar structure and a collapsed state (stored in the browser); on small screens it moves into a menu.

## Still open

| Element | OpenHands | Here |
| --- | --- | --- |
| Chips below the message box | pill, 1px border `rgb(64, 64, 64)`, padding 4px 10px ("Open Repository", "Plugins") | only the project pill |
| Sidebar details | search field, "Customize", "Automate" | not present (no matching features) |

Not compared at all: the light theme and the chat view (message bubbles, action rows). OpenHands needs a started
conversation for that, which has side effects and costs on the user's account.
