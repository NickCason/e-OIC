# Webfonts

This directory holds the self-hosted webfonts used by the e-OIC UI.

## Files expected here

| File | Required? | Source |
|---|---|---|
| `Montserrat-400.woff2` | yes | https://fonts.google.com/specimen/Montserrat (OFL) |
| `Montserrat-500.woff2` | yes | same |
| `Montserrat-600.woff2` | yes | same |
| `Montserrat-700.woff2` | yes | same |
| `RobotoSlab-500.woff2` | yes (Choplin fallback) | https://fonts.google.com/specimen/Roboto+Slab (OFL) |
| `RobotoSlab-600.woff2` | yes (Choplin fallback) | same |
| `Choplin-500.woff2` | optional (production) | Licensed via E Tech Group webfont license (commercial) |
| `Choplin-600.woff2` | optional (production) | same |

## How fonts are loaded

`src/styles.css` declares `@font-face` rules for all of the above. Both
Choplin and Roboto Slab fall back into the same `--font-display` family
stack: `'Choplin', 'Roboto Slab', ui-serif, Georgia, serif`. If Choplin
files are absent, Roboto Slab renders. The design reads correctly with
either.

## Adding Choplin (production deploy)

Drop the licensed `Choplin-500.woff2` and `Choplin-600.woff2` files in
this directory and rebuild. No code changes are required.

## Service worker precache

The service worker precaches all `.woff2` files in this directory so the
fonts work fully offline. After adding/removing a font file, bump
`VERSION` in `public/service-worker.js`.
