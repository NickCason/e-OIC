# e-OIC UI Redesign — Design Spec

**Date:** 2026-04-30
**Status:** Draft for review
**Direction:** A — "Choplin Editorial"

## Goal

Replace the current generic dark-blue admin UI with a branded, modern-SaaS visual language built on the E Tech Group brand kit. The result should feel premium and considered (Linear/Notion polish) while remaining unambiguously an E Tech Group product, with enough energy to stay engaging during long field-data-entry sessions.

This is a comprehensive UI pass: tokens, typography, components, screens, interactions, empty states, microinteractions. It is **not** a navigation/IA rewrite — the existing job → panel → sheet → row hierarchy is sound and stays.

## Non-goals

- No new top-level features
- No onboarding / first-run flow (deferred)
- No changes to data model, export pipeline, or storage
- No Service Worker / PWA shell changes beyond bumping `BUILD_VERSION`
- No backwards compatibility for existing users' theme settings — auto detect supersedes the current toggle

## Direction summary

**A. Choplin Editorial.** Slab-serif page titles (Choplin from the brand kit) carry the "expensive" tell that no other field app has. Montserrat handles all UI labels, data, and chrome. The brand mark logo anchors the app bar. Brand color (dark blue `#002E5D`) is the dominant accent on chrome and active states; orange (`#BE4829`) is reserved for primary actions, the FAB, and a single optional accent word in section titles.

Both light and dark themes are first-class. The app reads `prefers-color-scheme` and follows it; Settings retains a manual override (Auto / Light / Dark).

## Design tokens

### Color

Two complete palettes derived from the E Tech Group brand kit. Stored as CSS custom properties on `[data-theme="light"]` and `[data-theme="dark"]` (`auto` resolves to one or the other at load time and on `prefers-color-scheme` change).

**Light theme**

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F8F7F2` | App background (brand off-white) |
| `--bg-2` | `#FFFFFF` | Cards, modals, lifted surfaces |
| `--bg-3` | `#EFEEE8` | Hover, secondary surfaces, search bar bg |
| `--border` | `rgba(0,46,93,0.10)` | Card borders, divider lines |
| `--border-strong` | `rgba(0,46,93,0.18)` | Input borders |
| `--text` | `#002E5D` | Primary text (brand dark blue) |
| `--text-dim` | `#796E65` | Secondary text (brand warm gray) |
| `--text-strong` | `#001A38` | Slab titles, emphasis |
| `--accent` | `#002E5D` | Active states, focus rings, navy chrome |
| `--accent-2` | `#3C5EAB` | Hover on accent, secondary brand blue |
| `--energy` | `#BE4829` | Primary CTA, FAB, save-and-next, accent words |
| `--energy-soft` | `rgba(190,72,41,0.08)` | Energy backgrounds (warm-job tint) |
| `--ok` | `#1A8A5A` | Completion dots, success states |
| `--warn` | `#D4A017` | Partial dots, warnings |
| `--danger` | `#B91C1C` | Destructive actions |
| `--shadow-sm` | `0 1px 2px rgba(0,46,93,0.04)` | Subtle card lift |
| `--shadow-md` | `0 4px 12px rgba(0,46,93,0.08)` | Modal, FAB |
| `--shadow-lg` | `0 8px 24px rgba(0,46,93,0.15)` | Lightbox |

**Dark theme**

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#06182F` | App background |
| `--bg-2` | `#0D2545` | Cards, modals |
| `--bg-3` | `#152D52` | Hover, secondary surfaces |
| `--border` | `rgba(255,255,255,0.06)` | Card borders |
| `--border-strong` | `rgba(255,255,255,0.10)` | Input borders |
| `--text` | `#E8EBF0` | Primary text |
| `--text-dim` | `#9AA8C1` | Secondary text |
| `--text-strong` | `#FFFFFF` | Slab titles, emphasis |
| `--accent` | `#FFFFFF` | Active state on dark (inverted from light) |
| `--accent-2` | `#3C5EAB` | Light blue accents |
| `--energy` | `#BE4829` | Primary CTA, FAB |
| `--energy-soft` | `rgba(190,72,41,0.15)` | Energy backgrounds |
| `--ok` | `#3FB87E` | Completion |
| `--warn` | `#E5B73B` | Partial |
| `--danger` | `#EF4444` | Destructive |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.4)` | Subtle |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.5)` | Modal, FAB |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.6)` | Lightbox |

### Typography

Two families. Both are loaded via `@font-face` from self-hosted `.woff2` files in `public/fonts/`.

- **Display — Choplin** (slab serif). Used on page titles, job titles, large stat values, the "e-OIC" wordmark in the app bar.
  - Weights to ship: 500 (Medium), 600 (Semibold)
  - Fallback stack: `'Choplin', 'Roboto Slab', 'Zilla Slab', ui-serif, Georgia, serif`
  - Roboto Slab is included as a self-hosted fallback so layouts hold if Choplin fails to load.

- **UI — Montserrat** (geometric sans). All other text: labels, fields, buttons, table content, navigation, form data.
  - Weights to ship: 400, 500, 600, 700
  - Fallback stack: `'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

**Font loading.** `font-display: swap` to avoid blocking paint. Fallback metrics tuned with `size-adjust` / `ascent-override` so swap is not jarring. Fonts cached by the service worker.

**Choplin licensing.** Choplin is commercial (René Bieder). Production deployment requires an E Tech Group webfont license. The repo includes a `public/fonts/README.md` documenting the path: drop licensed `.woff2` files there to activate; without them, Roboto Slab fallback renders. Until license is provisioned, the app ships with Roboto Slab and the design still reads correctly.

### Type ramp

| Role | Family | Size | Weight | Line height | Letter-spacing |
|---|---|---|---|---|---|
| Display L (page hero) | Choplin | 28px | 600 | 1.1 | -0.01em |
| Display M (page title) | Choplin | 22px | 600 | 1.15 | -0.005em |
| Display S (stat values) | Choplin | 24px | 600 | 1.0 | -0.01em |
| Heading (group head) | Montserrat | 14px | 600 | 1.3 | 0 |
| Body | Montserrat | 14px | 400 | 1.45 | 0 |
| Body-strong | Montserrat | 14px | 600 | 1.45 | 0 |
| Label (uppercase pretitle) | Montserrat | 11px | 600 | 1.3 | 0.06em |
| Caption / hint | Montserrat | 12px | 400 | 1.3 | 0 |
| Wordmark (app bar) | Choplin | 16px | 600 | 1 | -0.01em |
| Input | Montserrat | 16px | 500 | 1.3 | 0 |

Input stays at 16px to preserve the iOS no-zoom guarantee already in place.

### Spacing

8-point grid. Tokens: `--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`, `--sp-5: 20px`, `--sp-6: 24px`, `--sp-8: 32px`, `--sp-10: 40px`.

### Radius

`--r-sm: 6px` (inputs, small chips), `--r-md: 10px` (cards, buttons), `--r-lg: 16px` (modals, sheets), `--r-pill: 999px` (tabs, row pills, FAB).

### Iconography

**Lucide** via `lucide-react`. Default size 18px, stroke width 1.75. Tree-shaken per-import (only what we use ships). Replaces all current emoji and Unicode glyph icons.

| Use | Icon |
|---|---|
| Back | `ChevronLeft` |
| New | `Plus` |
| Settings | `Settings` |
| Search | `Search` |
| Camera | `Camera` |
| Photo | `Image` |
| GPS | `MapPin` |
| Save & next | `ArrowRight` |
| Saved (toast) | `Check` |
| Delete | `Trash2` |
| Export | `Download` |
| Hyperlink | `Link` |
| Empty arrow | `ArrowDown` |
| All sheets | `LayoutGrid` |
| Expand row | `ChevronDown` |
| Photo missing | `ImageOff` |

The only legacy glyphs that stay: the OOXML checkbox glyphs (☑ / ☐) used inside the exported xlsx — those are part of the export format, not the app UI.

## Component inventory

Components that get a full visual rebuild:

- **AppBar** — adds mark logo, slab wordmark, breadcrumb pretitle pattern, Lucide icon buttons
- **Card** — softer shadow, brand border tint
- **Field** (label + input) — uppercase label, refined focus ring (2px navy outline)
- **Button** — primary (energy), secondary (outline navy), ghost, danger; new icon-only variant
- **Tab** — single-dot status, slimmer pill, "All sheets" overflow trailing button
- **Row pill** — same shape, refined active state, the existing rename-via-tap behavior preserved
- **Group / GroupHead** — slab name, count chip
- **Modal** — bottom sheet on mobile, centered on tablet
- **Toast** — Lucide icon + dismiss
- **Lightbox** — themed (not pure black), brand-tinted overlay, Lucide controls
- **FAB** — energy color, shadow with brand tint, press-scale animation
- **Empty state** (new component) — illustration slot + slab heading + body + arrow CTA pointing to the action that resolves it
- **Sheet picker** (new) — bottom-sheet replacement for the "All sheets" overflow

Components that stay as-is structurally but pick up the new tokens:

- `PhotoCapture`, `PhotoChecklist`, `RowPhotos`, `ToastHost`, `JobList`, `JobView`, `PanelView`, `SheetForm`, `ExportDialog`, `SettingsView`

## Screens

### JobList

Header: mark logo + slab "e-OIC" wordmark, settings icon-button on right.
Hero: pretitle "N ACTIVE INVESTIGATIONS", slab "Your jobs".
Search: rounded search field with Lucide `Search` icon.
Stat row: three tiles — In progress / Photos / Pending. Slab numerals.
Job cards: monogram tile (slab two letters from job name) + title + subtitle (`N panels · N rows · MMM dd`) + thin progress bar + percentage on the right. Tap navigates to JobView.
FAB: orange `Plus` for "new job".

Empty state when no jobs: centered illustration slot ("clipboard" Lucide), slab "No jobs yet", body "Tap the orange + below to start your first investigation.", `ArrowDown` icon pointing to the FAB.

### JobView (panel within a job)

Header: back chevron, mark logo, job name + breadcrumb crumb (`Panel name · Sheet name`), overflow `MoreHorizontal` for export / delete.
Hero: pretitle "PANEL · 4 of 13 sheets", slab panel name with optional accent word in `--energy`.
Tabs: horizontal-scroll pill row, single status dot per tab, **trailing "All sheets" overflow button** with `LayoutGrid` icon. Tapping it opens the Sheet Picker bottom sheet.
Row pills: existing pattern, single-dot active state.
Row card: group head (slab name + count chip), fields, **sticky bottom action bar with "Save & next row →" button (energy)**.

Sheet Picker bottom sheet: full list of 13 sheets, each a row showing icon + name + dot + completion ("8/12 rows"). Tap to jump. Closes on selection.

### Row entry (inside JobView)

Field types:
- Text input — uppercase label, value, optional inline hint ("amps")
- Enum dropdown — chevron affordance, opens native iOS picker (already in place)
- Autocomplete (Area, Panel Name, etc.) — text input with `<datalist>` (already in place)
- Checkbox / boolean — custom-styled checkbox using `--ok` for the checked state (no native UI; checked produces `☑` in xlsx export)
- Photo — small camera button below the field, taps into PhotoCapture; thumbnail strip below if photos exist

Sticky action bar (bottom of viewport, above safe area): "Save & next row →" primary button. Sub-action "All saved" pill on the left animates in for 1.2s after autosave commits.

Autosave: per-field on blur. Action bar is the *commit point* — tapping it advances to the next row pill. If no next row exists, it morphs into "+ New row" (energy).

### PanelView

The intermediate screen between JobList and JobView (current behavior). Shows the panel's own metadata (Area, Panel Name, etc.) above a button to "Open sheets". Same component grammar as JobView.

### Photos screen

Header: same pattern, breadcrumb "Panel · Photos", export icon.
Hero: pretitle "N OF M CAPTURED", slab "Photo evidence".
Photo checklist: list of items, each with custom checkbox + name + count badge. Done items show the navy `--ok` checkmark.
"Recent" section: 3-column photo grid with rounded corners. Each photo tile shows GPS chip (`MapPin` Lucide + lat/lng) bottom-left, delete button (`Trash2`) bottom-right on long-press.
Trailing photo tile is a dashed "+ Add" empty placeholder.
FAB: `Camera` icon, energy color.

Empty state: slab "No photos yet", body "Walk the panel and tap the orange camera below to start.", `ArrowDown` to FAB.

### Lightbox

Triggered by tapping a photo tile. Replaces current near-black overlay.

- Background: `--text-strong` at 92% opacity (very dark navy in light, near-black in dark) — themed, not pure `#000`.
- Frame: themed close button (top-right, glass-style chip), `MapPin` GPS chip if available (top-left), `Trash2` (bottom-right).
- Image: contain-fit, max 95vw / 90vh. Pinch-zoom enabled (CSS `touch-action: pinch-zoom`).
- Swipe left/right to navigate between photos in the same row (new behavior).
- Tap close, tap outside frame, or swipe down to dismiss.

### ExportDialog

Currently a basic modal with a single "Generate" button. Redesign as a proper sheet:

- Bottom sheet, slab title "Export job".
- Three info rows: panels (count), rows (count), photos (count).
- Toggle: "Include photos" (default on).
- Toggle: "Include sheet job snapshot JSON" (default off, advanced).
- Primary button: energy "Generate .zip". Tapping it shows an inline progress: spinner → "Generating xlsx" → "Bundling photos" → "Done". Then a "Save to Files" / "Share…" row uses iOS Share Sheet.
- Cancel: ghost "Cancel" at the bottom.

### SettingsView

Three sections, each a card with slab subheading:

1. **Display** — Theme (Auto / Light / Dark segmented control), Build version (read-only chip).
2. **Capture** — GPS toggle (existing functionality, restyled).
3. **Data** — Storage usage stat row (used / available bars), "Reload sample job" button (existing), "Export backup" / "Import backup" buttons, "Clear all data" (danger ghost).

Footer: small mark logo, slab "e-OIC", build hash, link to repo.

### Empty states (general pattern)

A reusable `<EmptyState>` component:

```
[Lucide icon, 32px, --text-dim]
[Slab heading, Display M, --text-strong]
[Body, Montserrat 14, --text-dim, max-width 280px, centered]
[ArrowDown icon, --energy] (only when there's a target FAB/button)
```

Used on: JobList (no jobs), JobView (panel with no rows on a sheet), Photos (no photos yet), Settings backup (no backup found).

## Interaction patterns

### Hybrid save

Two save commits:
1. **Silent autosave on blur.** Field commits to IndexedDB. After commit, a small "Saved ✓" pill animates in the action bar for 1.2s, then fades.
2. **Explicit Save & next.** Sticky action bar primary button. Tapping it commits any in-flight field, advances row pill to the next row, and scrolls the new row into view. Haptic light tap on iOS (uses the existing iOS haptic API where available, no-op otherwise).

If user navigates away without tapping, autosave guarantees nothing is lost. The action bar is a forward-momentum tool, not a safety net.

### Tab transitions

Sheet tab switch: 180ms cross-fade of card area, no horizontal slide (slides feel slow on long scrolling forms). Active tab pill morphs background color over 180ms.

### "Save & next" animation

On tap:
1. Button scales to 0.96 (50ms).
2. Action bar slides up 4px and the "Saved ✓" pill briefly appears next to it (200ms).
3. Card area cross-fades to next row (180ms).
4. New row pill scrolls into the active position with `behavior: smooth`.

Whole sequence under 400ms.

### Microinteractions

- **FAB press**: scale to 0.92, shadow tightens, 80ms.
- **Card hover (desktop)**: border darkens to `--accent`, no transform.
- **Modal / bottom sheet open**: 250ms ease-out slide-up + 150ms backdrop fade.
- **Toast**: slide up from bottom (250ms), auto-dismiss after 2.5s, dismissible by swipe-down.
- **Empty state arrow**: gentle 1.5s loop translateY(0 → 4px → 0) to draw the eye toward the FAB.

All animations honor `prefers-reduced-motion: reduce` and degrade to instant transitions when set.

### Accessibility

- All interactive elements meet 44px minimum touch target.
- Focus ring: 2px `--accent` outline at 2px offset, visible on keyboard navigation only (`:focus-visible`).
- Color contrast: text/background pairs validated for WCAG AA in both themes. Specifically, `--text-dim` on `--bg-2` is 4.7:1 light / 4.6:1 dark.
- Lucide icons paired with text where action is non-obvious; standalone icon buttons get `aria-label`.
- Slab titles are still rendered as `<h1>` / `<h2>` — display family is purely visual, not semantic.

## Theme detection

On app load, read `localStorage.themePref` (existing key, values: `auto` | `light` | `dark`). Default `auto` for new installs. When `auto`, attach a `MediaQueryList` listener on `prefers-color-scheme: dark` and set `[data-theme]` reactively.

Settings exposes the same three options as a segmented control.

The current theme toggle is replaced; existing users with a saved `light` or `dark` keep that preference. No migration needed.

## Implementation considerations

- **Bundle size.** Lucide is tree-shakeable per icon. Icons used in this spec total ~16 icons × ~0.5kb gzip each = ~8kb extra. Choplin + Roboto Slab + Montserrat in two weights each = ~120kb of `.woff2` total, but font-loading is async and deferred.
- **Service worker.** Bump `VERSION` to `v15`. Add `.woff2` files to the precache list.
- **CSS architecture.** Keep the single-file `src/styles.css` model. The file is reorganized into clearly-labeled sections (`/* === tokens === */`, `/* === base === */`, `/* === components === */`, `/* === screens === */`) but stays as one stylesheet. Component-specific styles live in the components section in the order components were introduced. No CSS-modules migration. This keeps the diff scoped to one file and avoids a build-system change.
- **Build version.** Bump `BUILD_VERSION` to `v15`. Update `SPEC.md` reference.
- **No data model changes.** All visual; no IndexedDB schema migrations needed.
- **iOS quirks already handled** (input font-size pinning, `display:none` photo input fix, button flex stretch fix) carry forward into the new component CSS.

## Out of scope (deferred)

- Onboarding flow
- Per-user account / sign-in
- Animation library beyond CSS transitions (no Framer Motion / similar)
- Offline-first conflict resolution UI
- Multi-job export
- Custom photo annotations / drawing
- Map view of GPS-tagged photos
