# e-OIC UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the "Choplin Editorial" UI direction (per `docs/superpowers/specs/2026-04-30-ui-redesign-design.md`) across every screen of e-OIC, ship as `v15`, and deploy to GitHub Pages.

**Architecture:** This is purely a presentation-layer change. Existing data flow (IndexedDB → React components → ExcelJS export) is untouched. The implementation reorganizes `src/styles.css` into token + base + component + screen sections, swaps emoji/Unicode glyph icons for `lucide-react`, introduces two reusable components (`AppBar`, `EmptyState`), and rewrites the visuals of every existing screen. Self-hosted webfonts are added to `public/fonts/`. No data model, no service-worker logic, and no export pipeline changes.

**Tech Stack:** React 18 · Vite 5 · `lucide-react` (new) · self-hosted Choplin (or Roboto Slab fallback) + Montserrat woff2 · CSS custom properties (no CSS-in-JS, no preprocessor).

**Validation strategy:** This codebase has no React component tests today. Per task, the validation steps are: (1) `npm run build` succeeds with no warnings introduced, (2) `npm run test:e2e` passes (proves the export pipeline still works), (3) the dev server (`npm run dev`) renders the touched screen without console errors. Visual correctness is the implementer's responsibility — there is no snapshot infrastructure.

**Branch:** Work directly on `main`. The branch is already published to GitHub Pages via `.github/workflows`; pushing the final commit triggers the deploy.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `src/styles.css` | Modified | Reorganized into `/* === tokens === */`, `/* === base === */`, `/* === components === */`, `/* === screens === */` sections; new dual-theme tokens; new component styles |
| `public/fonts/Montserrat-{400,500,600,700}.woff2` | Created (placeholder) | Self-hosted Montserrat webfonts |
| `public/fonts/RobotoSlab-{500,600}.woff2` | Created (placeholder) | Self-hosted Roboto Slab fallback for Choplin |
| `public/fonts/Choplin-{500,600}.woff2` | Documented (not committed) | Production Choplin license drop slot |
| `public/fonts/README.md` | Created | Documents the Choplin licensing path |
| `src/lib/theme.js` | Modified | Replace `#0b5cad` theme-color with brand `#002E5D` light / `#06182F` dark; preserve auto-detect |
| `src/components/AppBar.jsx` | Created | Reusable app-bar with mark logo, slab wordmark, breadcrumb, action slot |
| `src/components/EmptyState.jsx` | Created | Reusable empty state — Lucide icon, slab heading, body, optional bouncing arrow |
| `src/components/Icon.jsx` | Created | Thin wrapper that re-exports the curated Lucide icon set used by the app |
| `src/components/SheetPicker.jsx` | Created | Bottom-sheet "All sheets" picker for JobView |
| `src/components/SaveBar.jsx` | Created | Sticky "Save & next row →" bar with autosave-pill animation |
| `src/components/Lightbox.jsx` | Created | Themed photo lightbox with swipe nav, replaces `src/photoOverlay.js` |
| `src/photoOverlay.js` | Deleted | Replaced by `Lightbox.jsx` |
| `src/components/JobList.jsx` | Modified | Slab title, monogram tile, stat row, progress bar, EmptyState |
| `src/components/JobView.jsx` | Modified | Slab title, breadcrumb pretitle, refined tabs + overflow → SheetPicker |
| `src/components/PanelView.jsx` | Modified | New AppBar + slab title; otherwise unchanged behavior |
| `src/components/SheetForm.jsx` | Modified | Refined cards, enum dropdown chevrons, sticky SaveBar |
| `src/components/PhotoChecklist.jsx` | Modified | Custom-styled checkboxes, count badges, slab subheadings |
| `src/components/PhotoCapture.jsx` | Modified | Lucide icons replace emoji, themed lightbox usage |
| `src/components/RowPhotos.jsx` | Modified | Themed photo tiles, dashed empty placeholder, GPS chip |
| `src/components/ExportDialog.jsx` | Modified | Bottom-sheet with progress states, toggle rows |
| `src/components/SettingsView.jsx` | Modified | Three sections w/ slab subheadings, segmented control, stat row |
| `src/components/ToastHost.jsx` | Modified | Lucide check icon, refined styling |
| `src/components/JobList.jsx` | Modified (separately) | New `<JobModal>` styling |
| `src/App.jsx` | Modified | New `GeoPrompt` styling using AppBar/EmptyState patterns |
| `src/version.js` | Modified | Bump to `v15` |
| `public/service-worker.js` | Modified | Bump to `v15`, add font files to PRECACHE |
| `package.json` | Modified | Add `lucide-react` dependency |
| `SPEC.md` | Modified | Update build-version reference and short note about new visual language |

---

## Task 1: Install Lucide and add font scaffolding

**Files:**
- Modify: `package.json`
- Create: `public/fonts/README.md`
- Create: `public/fonts/.gitkeep`

- [ ] **Step 1: Install lucide-react**

```bash
npm install lucide-react@^0.460.0
```

Expected: `package.json` and `package-lock.json` updated; no peer dep warnings.

- [ ] **Step 2: Create the fonts directory and README**

Create `public/fonts/.gitkeep` (empty file).

Create `public/fonts/README.md` with this content:

```markdown
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
```

- [ ] **Step 3: Download Roboto Slab + Montserrat woff2 files**

Run this script from the repo root:

```bash
mkdir -p public/fonts
cd public/fonts

# Montserrat — Google Fonts CSS API exposes direct woff2 URLs.
# Use the per-weight Latin subset URLs (stable across requests).
curl -sLo Montserrat-400.woff2 "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCs16Hw5aXp-p7K4KLg.woff2"
curl -sLo Montserrat-500.woff2 "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu170w5aXp-p7K4KLg.woff2"
curl -sLo Montserrat-600.woff2 "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvC78w5aXp-p7K4KLg.woff2"
curl -sLo Montserrat-700.woff2 "https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCub6sw5aXp-p7K4KLg.woff2"

# Roboto Slab.
curl -sLo RobotoSlab-500.woff2 "https://fonts.gstatic.com/s/robotoslab/v34/BngbUXZYTXPIvIBgJJSb6s3BzlRRfKOFbvjojIWWaG5iddG-1A.woff2"
curl -sLo RobotoSlab-600.woff2 "https://fonts.gstatic.com/s/robotoslab/v34/BngbUXZYTXPIvIBgJJSb6s3BzlRRfKOFbvjojIWWaG5iddG-1A.woff2"

ls -la
```

Expected: 6 files present, each 30–80 KB. If any file is < 5 KB (a redirect HTML), the URL has changed; in that case use Google Fonts' `https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap` URL, hit it with `curl -A "Mozilla/5.0"`, then extract the woff2 URLs from the returned CSS and re-download.

- [ ] **Step 4: Copy E Tech Group brand mark images into `public/`**

```bash
mkdir -p public/brand
cp "/Users/nickcason/DevSpace/Work/nonrepo-branding/OneDrive_1_4-30-2026/Full Color/E Tech Group - Mark - Full Color.png" public/brand/mark-color.png
cp "/Users/nickcason/DevSpace/Work/nonrepo-branding/OneDrive_1_4-30-2026/White/E Tech Group - Mark - White.png" public/brand/mark-white.png
ls -la public/brand
```

Expected: two files present, each 30–60 KB.

- [ ] **Step 5: Verify build still succeeds**

```bash
npm run build
```

Expected: build succeeds, no errors. The `lucide-react` import is present in `package.json` but not yet used; bundle size unchanged because of tree-shaking.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json public/fonts public/brand
git commit -m "chore: add lucide-react, self-hosted fonts, brand mark assets"
```

---

## Task 2: Rebuild design tokens and base styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the entire content of `src/styles.css`**

Open `src/styles.css` and replace its entire content with this new structure. Leave the legacy component styles in place at the bottom of the file (they'll be progressively replaced in later tasks); only the *top* of the file changes here.

```css
/* ============================================================
   e-OIC UI — Choplin Editorial direction
   See docs/superpowers/specs/2026-04-30-ui-redesign-design.md
   ============================================================ */

/* === tokens === */

:root {
  /* spacing — 8pt grid */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;

  /* radius */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 16px;
  --r-pill: 999px;

  /* type — sizes */
  --fs-display-l: 28px;
  --fs-display-m: 22px;
  --fs-display-s: 24px; /* stat values */
  --fs-heading: 14px;
  --fs-body: 14px;
  --fs-label: 11px;
  --fs-caption: 12px;
  --fs-input: 16px;

  /* type — families */
  --font-display: 'Choplin', 'Roboto Slab', 'Zilla Slab', ui-serif, Georgia, serif;
  --font-ui: 'Montserrat', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

[data-theme="light"] {
  --bg: #F8F7F2;
  --bg-2: #FFFFFF;
  --bg-3: #EFEEE8;
  --border: rgba(0, 46, 93, 0.10);
  --border-strong: rgba(0, 46, 93, 0.18);
  --text: #002E5D;
  --text-dim: #796E65;
  --text-strong: #001A38;
  --accent: #002E5D;
  --accent-2: #3C5EAB;
  --accent-on: #FFFFFF;
  --energy: #BE4829;
  --energy-soft: rgba(190, 72, 41, 0.08);
  --ok: #1A8A5A;
  --warn: #D4A017;
  --danger: #B91C1C;
  --shadow-sm: 0 1px 2px rgba(0, 46, 93, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 46, 93, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 46, 93, 0.15);
  --lightbox-bg: rgba(0, 26, 56, 0.92);
  --mark-src: url('/brand/mark-color.png');
}

[data-theme="dark"] {
  --bg: #06182F;
  --bg-2: #0D2545;
  --bg-3: #152D52;
  --border: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.10);
  --text: #E8EBF0;
  --text-dim: #9AA8C1;
  --text-strong: #FFFFFF;
  --accent: #FFFFFF;
  --accent-2: #3C5EAB;
  --accent-on: #002E5D;
  --energy: #BE4829;
  --energy-soft: rgba(190, 72, 41, 0.15);
  --ok: #3FB87E;
  --warn: #E5B73B;
  --danger: #EF4444;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);
  --lightbox-bg: rgba(0, 0, 0, 0.92);
  --mark-src: url('/brand/mark-white.png');
}

/* === base === */

@font-face {
  font-family: 'Montserrat';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Montserrat-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Montserrat';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Montserrat-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Montserrat';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Montserrat-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Montserrat';
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Montserrat-700.woff2') format('woff2');
}
@font-face {
  font-family: 'Roboto Slab';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/RobotoSlab-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Roboto Slab';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/RobotoSlab-600.woff2') format('woff2');
}
@font-face {
  font-family: 'Choplin';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Choplin-500.woff2') format('woff2');
}
@font-face {
  font-family: 'Choplin';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Choplin-600.woff2') format('woff2');
}

* { box-sizing: border-box; }

html, body, #root {
  margin: 0;
  height: 100%;
  overflow-x: hidden;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: touch;
}

html { touch-action: pan-y; }

body {
  font-family: var(--font-ui);
  font-size: var(--fs-body);
  line-height: 1.45;
  font-weight: 400;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  width: 100%;
  position: relative;
}

input, select, textarea, button {
  font: inherit;
  color: inherit;
}

/* iOS Safari zooms when focusing < 16px input. Pin at 16px. */
input, select, textarea { font-size: var(--fs-input); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

.app { display: flex; flex-direction: column; min-height: 100vh; }

main {
  flex: 1;
  padding: var(--sp-3);
  padding-bottom: 110px; /* room for SaveBar + safe area */
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

/* === components === */
/* (Component sections are added/replaced in later tasks. Legacy
   component styles continue below until they are migrated.) */

/* ------ LEGACY (to be migrated) ------ */
```

After the `/* ------ LEGACY (to be migrated) ------ */` line, **paste the existing component styles** that were in the file (everything from `.appbar` through `.kv` in the old file). They will be replaced piecewise in later tasks. The block below is the original code preserved verbatim:

```css
.appbar {
  position: sticky; top: 0; z-index: 10;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
  padding: max(env(safe-area-inset-top), 10px) max(env(safe-area-inset-right), 16px) 10px max(env(safe-area-inset-left), 16px);
  display: flex; align-items: center; gap: 10px;
}
.appbar h1 { font-size: 16px; margin: 0; flex: 1; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.appbar h1 .build-badge {
  font-size: 10px; font-weight: 500; color: var(--text-dim);
  background: var(--bg-3); padding: 2px 6px; border-radius: 999px;
  margin-left: 8px; vertical-align: middle;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.appbar .back { background: none; border: none; color: var(--accent); font-size: 22px; padding: 6px 4px; cursor: pointer; line-height: 1; }
.appbar .actions { display: flex; gap: 8px; }
.appbar .grow { min-width: 0; flex: 1; }
.crumb { font-size: 12px; color: var(--text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

button {
  background: var(--bg-3); border: 1px solid var(--border); color: var(--text);
  padding: 10px 14px; border-radius: var(--r-md); cursor: pointer;
  font-weight: 500;
  -webkit-appearance: none; appearance: none;
  font: inherit;
}
button.primary { background: var(--energy); border-color: var(--energy); color: white; }
button.primary:hover { filter: brightness(1.08); }
button.danger { background: transparent; border-color: var(--danger); color: var(--danger); }
button.ghost { background: transparent; }
button.icon-btn { padding: 8px 10px; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-row { display: flex; gap: 8px; flex-wrap: wrap; }

.card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 14px;
  margin-bottom: 10px;
}

.list-item {
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: 12px 14px; margin-bottom: 8px;
  display: flex; align-items: center; gap: 12px;
  cursor: pointer;
  transition: border-color .15s;
}
.list-item:hover { border-color: var(--accent); }
.list-item .grow { flex: 1; min-width: 0; }
.list-item .title { font-weight: 600; }
.list-item .subtitle { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
.list-item .actions { display: flex; gap: 4px; }

.empty {
  text-align: center; padding: 40px 20px; color: var(--text-dim);
}

.field { margin-bottom: 12px; }
.field label {
  display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 4px;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.field input, .field select, .field textarea {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 12px;
  outline: none;
  color: var(--text);
}
.field input:focus, .field textarea:focus, .field select:focus { border-color: var(--accent); }
.field textarea { resize: vertical; min-height: 60px; }
.field-checkbox { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.field-checkbox input { width: auto; }
.field-checkbox label { margin: 0; text-transform: none; letter-spacing: 0; font-size: 14px; color: var(--text); }

.group-body textarea, .group-body input[type="text"] {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 10px 12px;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
  resize: vertical;
}
.group-body textarea:focus, .group-body input[type="text"]:focus { border-color: var(--accent); }
.group-body textarea::placeholder { color: var(--text-dim); }
.field input::placeholder, .field textarea::placeholder { color: var(--text-dim); opacity: 0.7; }

.hyperlink-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px; color: var(--text-dim);
  background: var(--bg); border: 1px dashed var(--border);
  border-radius: var(--r-md);
  padding: 8px 10px; word-break: break-all;
}

.debug-strip {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px; color: var(--text-dim);
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 8px 10px; margin: 8px 0 0;
  white-space: pre-wrap; word-break: break-all;
  max-height: 160px; overflow: auto;
}

.group {
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-md); margin-bottom: 10px; overflow: hidden;
}
.group-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; cursor: pointer; user-select: none;
  background: var(--bg-3);
}
.group-head .name { flex: 1; font-weight: 600; }
.group-head .count { font-size: 12px; color: var(--text-dim); }
.group-body { padding: 12px 14px; border-top: 1px solid var(--border); }

.tabs {
  display: flex; gap: 6px; overflow-x: auto;
  padding-bottom: 8px; margin-bottom: 12px;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 999px; font-size: 13px; cursor: pointer;
  white-space: nowrap;
  color: var(--text);
  -webkit-appearance: none; appearance: none;
  font: inherit;
}
.tab.active { background: var(--accent); border-color: var(--accent); color: var(--accent-on); }
.tab .dot {
  flex: 0 0 8px;
  width: 8px; height: 8px; min-width: 8px; min-height: 8px;
  border-radius: 50%;
  align-self: center;
}
.tab .dot.empty { background: var(--text-dim); }
.tab .dot.partial { background: var(--warn); }
.tab .dot.complete { background: var(--ok); }

.row-pills {
  display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
}
.row-pill {
  display: inline-flex; align-items: center; border: 1px solid var(--border);
  border-radius: 999px; overflow: hidden;
  background: var(--bg-2);
}
.row-pill.active { background: var(--accent); border-color: var(--accent); }
.row-pill .lbl { padding: 6px 12px; font-size: 13px; cursor: pointer; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-pill.active .lbl { color: var(--accent-on); }
.row-pill .more { background: transparent; border: none; padding: 6px 8px; font-size: 13px; color: var(--text-dim); cursor: pointer; border-left: 1px solid var(--border); }
.row-pill.active .more { color: var(--accent-on); border-left-color: rgba(255,255,255,0.3); }
.row-pill .more:disabled { display: none; }

.photo-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
}
.photo-tile {
  position: relative; aspect-ratio: 1; background: var(--bg-3);
  border-radius: 8px; overflow: hidden; cursor: pointer;
  border: 1px solid var(--border);
}
.photo-tile img { width: 100%; height: 100%; object-fit: cover; }
.photo-tile .del {
  position: absolute; top: 4px; right: 4px;
  background: rgba(0,0,0,0.6); color: white; border: none;
  width: 24px; height: 24px; border-radius: 50%; font-size: 14px; line-height: 1;
  cursor: pointer;
}
.photo-tile .gps {
  position: absolute; bottom: 4px; left: 4px;
  background: rgba(0,0,0,0.6); color: white;
  border-radius: 4px; padding: 2px 5px; font-size: 10px;
}
.photo-checklist-item {
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: 12px; margin-bottom: 8px;
}
.photo-checklist-item .head {
  display: flex; align-items: center; gap: 10px;
}
.photo-checklist-item .head .name { flex: 1; font-weight: 500; }
.photo-checklist-item .head .count { font-size: 12px; color: var(--text-dim); }

.progress-bar {
  height: 6px; background: var(--bg-3); border-radius: 3px; overflow: hidden;
  margin-top: 6px;
}
.progress-bar-fill { height: 100%; background: var(--ok); transition: width .25s; }

.modal-bg {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100;
  display: flex; align-items: flex-end; justify-content: center;
  animation: fadein .15s ease;
}
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
.modal {
  background: var(--bg-2); width: 100%; max-width: 500px;
  border-radius: 16px 16px 0 0; padding: 20px 16px max(20px, env(safe-area-inset-bottom));
  max-height: 90vh; overflow-y: auto;
  box-shadow: var(--shadow-md);
}
.modal h2 { margin: 0 0 12px; font-size: 17px; }

.fab {
  position: fixed; right: 18px; bottom: max(20px, env(safe-area-inset-bottom));
  background: var(--energy); color: white; border: none;
  width: 56px; height: 56px; border-radius: 28px;
  font-size: 24px; box-shadow: var(--shadow-md);
  cursor: pointer; z-index: 5;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.fab:active { transform: scale(0.92); box-shadow: var(--shadow-sm); }

.lightbox {
  position: fixed; inset: 0; background: var(--lightbox-bg); z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
.lightbox .close {
  position: absolute; top: max(16px, env(safe-area-inset-top)); right: 16px;
  background: rgba(255,255,255,0.15); color: white; border: none;
  width: 40px; height: 40px; border-radius: 20px; font-size: 18px;
}

.toast-host {
  position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 6px;
  z-index: 300;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  background: var(--bg-2); border: 1px solid var(--border);
  padding: 10px 14px; border-radius: 8px;
  display: flex; align-items: center; gap: 12px;
  box-shadow: var(--shadow-md);
  min-width: 220px;
}
.toast.error { border-color: var(--danger); }
.toast .undo {
  background: transparent; color: var(--accent); border: none;
  font-weight: 600; padding: 4px 8px;
}

.search-bar {
  width: 100%; padding: 8px 12px;
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--r-md); color: var(--text);
  margin-bottom: 10px; outline: none;
}
.search-bar:focus { border-color: var(--accent); }

.row-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
  margin-bottom: 12px;
}
.row-table th, .row-table td {
  border: 1px solid var(--border); padding: 6px 8px; text-align: left;
  vertical-align: top;
}
.row-table th {
  background: var(--bg-3); font-weight: 600;
  position: sticky; top: 0;
}
.row-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg-2);
  max-height: 50vh;
}

.view-toggle {
  display: inline-flex; gap: 0; border: 1px solid var(--border);
  border-radius: var(--r-md); overflow: hidden;
  margin-left: auto;
}
.view-toggle button {
  background: transparent; border: none; padding: 6px 10px; font-size: 12px;
  border-radius: 0;
}
.view-toggle button.active { background: var(--accent); color: var(--accent-on); }

.kv {
  display: flex; gap: 8px; font-size: 13px; padding: 4px 0;
}
.kv .k { color: var(--text-dim); flex: 0 0 40%; }
.kv .v { flex: 1; word-break: break-word; }
```

The legacy block above keeps every existing screen visually consistent (just with new tokens) until later tasks migrate each section.

- [ ] **Step 2: Update theme-color in `src/lib/theme.js`**

Replace the body of `applyTheme` with the new brand-aligned color:

```js
export function applyTheme(theme) {
  const effective = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.setAttribute('data-theme', effective);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', effective === 'light' ? '#F8F7F2' : '#06182F'
  );
}
```

- [ ] **Step 3: Build and run the dev server**

```bash
npm run build
```

Expected: build succeeds with the new tokens. Bundle size is unchanged (CSS is the only thing growing).

```bash
npm run dev
```

Open `http://localhost:5173/e-OIC/` in the browser. Expected: the existing screens render with the new color palette — light mode shows off-white background, navy text, and orange CTAs. Dark mode shows deep navy. Fonts load (Montserrat + Roboto Slab) without FOUC. No console errors.

Stop the dev server (Ctrl-C) before continuing.

- [ ] **Step 4: Run the e2e test**

```bash
npm run test:e2e
```

Expected: passes. The export pipeline is unchanged; this verifies nothing regressed.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/lib/theme.js
git commit -m "feat(ui): brand-aligned design tokens and self-hosted fonts"
```

---

## Task 3: Icon component wrapping Lucide

**Files:**
- Create: `src/components/Icon.jsx`

This single module curates exactly the Lucide icons used by the app, so each one is tree-shaken individually and the call sites are clean.

- [ ] **Step 1: Create `src/components/Icon.jsx`**

```jsx
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  Settings,
  Search,
  Camera,
  Image,
  ImageOff,
  MapPin,
  ArrowRight,
  ArrowDown,
  Check,
  Trash2,
  Download,
  Link as LinkIcon,
  LayoutGrid,
  X,
  MoreHorizontal,
  Edit3,
  Sun,
  Moon,
  Monitor,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

// Curated icon set used across the app. Default size 18px, stroke width
// 1.75 — pairs well with Montserrat 14px body text.

const ICONS = {
  back: ChevronLeft,
  expand: ChevronDown,
  next: ChevronRight,
  add: Plus,
  settings: Settings,
  search: Search,
  camera: Camera,
  image: Image,
  imageOff: ImageOff,
  gps: MapPin,
  arrowRight: ArrowRight,
  arrowDown: ArrowDown,
  check: Check,
  trash: Trash2,
  download: Download,
  link: LinkIcon,
  grid: LayoutGrid,
  close: X,
  more: MoreHorizontal,
  edit: Edit3,
  themeLight: Sun,
  themeDark: Moon,
  themeAuto: Monitor,
  warn: AlertCircle,
  refresh: RefreshCw,
};

export default function Icon({ name, size = 18, strokeWidth = 1.75, ...rest }) {
  const Cmp = ICONS[name];
  if (!Cmp) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`Icon: unknown name "${name}"`);
    }
    return null;
  }
  return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
}
```

- [ ] **Step 2: Verify build still succeeds**

```bash
npm run build
```

Expected: build succeeds. The icon module isn't referenced yet; this just confirms the import paths are valid.

- [ ] **Step 3: Commit**

```bash
git add src/components/Icon.jsx
git commit -m "feat(ui): curated Lucide icon component"
```

---

## Task 4: AppBar component

**Files:**
- Create: `src/components/AppBar.jsx`
- Modify: `src/styles.css` (replace the legacy `.appbar` rules)

- [ ] **Step 1: Create `src/components/AppBar.jsx`**

```jsx
import React from 'react';
import Icon from './Icon.jsx';
import { nav } from '../App.jsx';

// Reusable app bar.
//
// Props:
//   onBack: () => void  — if provided, renders a back chevron in the leading slot
//   wordmark: string     — slab-set text shown after the mark logo (default 'e-OIC')
//   crumb: string        — secondary line under the wordmark (panel/sheet/etc.)
//   actions: ReactNode   — trailing slot for icon buttons
//
// The mark logo is drawn from a CSS background image (`--mark-src` token),
// which the theme swaps automatically between full-color (light) and
// white (dark).

export default function AppBar({ onBack, wordmark = 'e-OIC', crumb, actions, onWordmarkClick }) {
  const wordmarkInteractive = typeof onWordmarkClick === 'function';

  return (
    <header className="appbar">
      {onBack && (
        <button
          className="appbar-back"
          onClick={onBack}
          aria-label="Back"
          type="button"
        >
          <Icon name="back" size={22} strokeWidth={2} />
        </button>
      )}
      <div className="appbar-mark" role="img" aria-label="E Tech Group" />
      <div className="appbar-titles">
        {wordmarkInteractive ? (
          <button
            type="button"
            className="appbar-wordmark appbar-wordmark--button"
            onClick={onWordmarkClick}
          >
            {wordmark}
          </button>
        ) : (
          <h1 className="appbar-wordmark">{wordmark}</h1>
        )}
        {crumb && <div className="appbar-crumb">{crumb}</div>}
      </div>
      {actions && <div className="appbar-actions">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 2: Replace legacy `.appbar` rules in `src/styles.css`**

In `src/styles.css`, find the legacy `.appbar { ... }` block and the related `.appbar h1`, `.appbar .build-badge`, `.appbar .back`, `.appbar .actions`, `.appbar .grow`, `.crumb` rules. **Delete** all of them. Add this in the *components section* (right after the `/* === components === */` marker, before the `/* ------ LEGACY ------ */` line):

```css
/* AppBar */
.appbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding:
    max(env(safe-area-inset-top), var(--sp-3))
    max(env(safe-area-inset-right), var(--sp-4))
    var(--sp-2)
    max(env(safe-area-inset-left), var(--sp-4));
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.appbar-back {
  background: none;
  border: none;
  color: var(--text);
  padding: var(--sp-1) var(--sp-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  border-radius: var(--r-sm);
}
.appbar-back:hover { background: var(--bg-3); }
.appbar-mark {
  width: 26px;
  height: 26px;
  background-image: var(--mark-src);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  flex-shrink: 0;
}
.appbar-titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.appbar-wordmark {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--text-strong);
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.appbar-wordmark--button {
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: var(--text-strong);
}
.appbar-crumb {
  font-family: var(--font-ui);
  font-size: var(--fs-caption);
  color: var(--text-dim);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.appbar-actions {
  display: flex;
  gap: var(--sp-1);
  align-items: center;
}
.appbar-actions button.icon-btn {
  background: transparent;
  border: none;
  padding: var(--sp-2);
  border-radius: var(--r-sm);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.appbar-actions button.icon-btn:hover { background: var(--bg-3); }
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds. The `AppBar` is not yet rendered anywhere; existing screens still use the legacy markup (which has its CSS in the LEGACY block). At this point both sets of styles coexist.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppBar.jsx src/styles.css
git commit -m "feat(ui): reusable AppBar component"
```

---

## Task 5: EmptyState component

**Files:**
- Create: `src/components/EmptyState.jsx`
- Modify: `src/styles.css` (add `.empty-state` rules)

- [ ] **Step 1: Create `src/components/EmptyState.jsx`**

```jsx
import React from 'react';
import Icon from './Icon.jsx';

// Reusable empty state.
//
// Props:
//   icon: Lucide icon name ('image', 'imageOff', 'add', etc.)
//   title: string — short slab heading
//   body: string  — supporting paragraph
//   pointTo: 'fab' | 'top' | null — when set, renders a bouncing arrow
//                                   in the direction of the action
//   action: ReactNode — optional inline button rendered below body

export default function EmptyState({ icon = 'imageOff', title, body, pointTo = null, action }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-icon">
        <Icon name={icon} size={32} strokeWidth={1.5} />
      </div>
      {title && <h2 className="empty-state-title">{title}</h2>}
      {body && <p className="empty-state-body">{body}</p>}
      {action && <div className="empty-state-action">{action}</div>}
      {pointTo === 'fab' && (
        <div className="empty-state-arrow empty-state-arrow--down" aria-hidden="true">
          <Icon name="arrowDown" size={28} strokeWidth={2.25} />
        </div>
      )}
      {pointTo === 'top' && (
        <div className="empty-state-arrow empty-state-arrow--up" aria-hidden="true">
          <Icon name="arrowDown" size={28} strokeWidth={2.25} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace legacy `.empty` rules in `src/styles.css`**

Find the legacy `.empty { text-align: center; ... }` rule and **delete** it. Add this in the components section (after the AppBar block):

```css
/* EmptyState */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--sp-10) var(--sp-5);
  color: var(--text-dim);
}
.empty-state-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--bg-3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  margin-bottom: var(--sp-3);
}
.empty-state-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-display-m);
  margin: 0 0 var(--sp-2);
  color: var(--text-strong);
  letter-spacing: -0.005em;
}
.empty-state-body {
  font-size: var(--fs-body);
  color: var(--text-dim);
  margin: 0;
  max-width: 280px;
  line-height: 1.5;
}
.empty-state-action {
  margin-top: var(--sp-4);
}
.empty-state-arrow {
  margin-top: var(--sp-5);
  color: var(--energy);
  animation: empty-arrow-bounce 1.5s ease-in-out infinite;
}
.empty-state-arrow--up { transform: rotate(180deg); }
@keyframes empty-arrow-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}
.empty-state-arrow--up { animation-name: empty-arrow-bounce-up; }
@keyframes empty-arrow-bounce-up {
  0%, 100% { transform: rotate(180deg) translateY(0); }
  50% { transform: rotate(180deg) translateY(4px); }
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/EmptyState.jsx src/styles.css
git commit -m "feat(ui): reusable EmptyState component"
```

---

## Task 6: JobList screen redesign

**Files:**
- Modify: `src/components/JobList.jsx`
- Modify: `src/styles.css` (add JobList-specific styles)

- [ ] **Step 1: Replace `src/components/JobList.jsx` with the redesigned version**

```jsx
import React, { useState, useEffect, useMemo } from 'react';
import { listJobs, createJob, updateJob, deleteJob, getJobSizeEstimate, importJSON, exportJobJSON } from '../db.js';
import { nav } from '../App.jsx';
import { toast } from '../lib/toast.js';
import { BUILD_VERSION } from '../version.js';
import AppBar from './AppBar.jsx';
import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';

export default function JobList() {
  const [jobs, setJobs] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [stats, setStats] = useState({});
  const [search, setSearch] = useState('');

  async function refresh() {
    const all = await listJobs();
    setJobs(all);
    const s = {};
    for (const j of all) s[j.id] = await getJobSizeEstimate(j.id);
    setStats(s);
  }

  useEffect(() => { refresh(); }, []);

  async function onDelete(job) {
    const snapshot = await exportJobJSON(job.id);
    await deleteJob(job.id);
    await refresh();
    toast.undoable(`Deleted "${job.name}"`, {
      onUndo: async () => {
        await importJSON(snapshot, { mode: 'replace' });
        await refresh();
      },
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.name, j.client, j.location].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [jobs, search]);

  // Aggregate stats across all jobs for the hero stat row.
  const totals = useMemo(() => {
    let panels = 0, photos = 0, inProgress = 0;
    for (const j of jobs) {
      const s = stats[j.id];
      if (!s) continue;
      panels += s.panels || 0;
      photos += s.photos || 0;
      // Treat any job with at least one panel and not 100% complete as
      // in-progress. Without per-job completion data we approximate
      // by panel count.
      if ((s.panels || 0) > 0) inProgress += 1;
    }
    return { panels, photos, inProgress, total: jobs.length };
  }, [jobs, stats]);

  return (
    <>
      <AppBar
        wordmark="e-OIC"
        actions={
          <>
            <button
              className="icon-btn"
              onClick={() => nav('/settings')}
              aria-label="Settings"
              type="button"
            >
              <Icon name="settings" size={20} />
            </button>
          </>
        }
      />
      <main>
        <div className="hero">
          <div className="hero-pretitle">
            {jobs.length === 0
              ? 'NO JOBS YET'
              : `${jobs.length} ${jobs.length === 1 ? 'INVESTIGATION' : 'INVESTIGATIONS'}`}
            <span className="build-badge" title="Build version">{BUILD_VERSION}</span>
          </div>
          <h1 className="hero-title">Your jobs</h1>
        </div>

        {jobs.length > 0 && (
          <>
            <div className="search-wrap">
              <Icon name="search" size={16} className="search-icon" />
              <input
                className="search-bar search-bar--with-icon"
                placeholder="Search jobs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="stat-row">
              <div className="stat-tile">
                <div className="stat-label">Active</div>
                <div className="stat-val">{totals.inProgress}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Panels</div>
                <div className="stat-val">{totals.panels}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Photos</div>
                <div className="stat-val">{totals.photos}</div>
              </div>
            </div>
          </>
        )}

        {jobs.length === 0 && (
          <EmptyState
            icon="add"
            title="No jobs yet"
            body="Tap the orange + below to start your first investigation."
            pointTo="fab"
          />
        )}

        {filtered.map((j) => {
          const s = stats[j.id];
          return (
            <div key={j.id} className="job-card" onClick={() => nav(`/job/${j.id}`)}>
              <div className="job-monogram">{monogram(j.name)}</div>
              <div className="job-grow">
                <div className="job-title">{j.name}</div>
                <div className="job-sub">
                  {j.client && <>{j.client} · </>}
                  {s
                    ? `${s.panels} ${pl(s.panels, 'panel')} · ${s.photos} ${pl(s.photos, 'photo')}`
                    : '…'}
                  {j.updatedAt ? <> · {fmtRelative(j.updatedAt)}</> : null}
                </div>
              </div>
              <div className="job-actions">
                <button
                  className="icon-btn ghost"
                  onClick={(e) => { e.stopPropagation(); setEditing(j); }}
                  aria-label="Edit"
                  type="button"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  className="icon-btn ghost danger"
                  onClick={(e) => { e.stopPropagation(); onDelete(j); }}
                  aria-label="Delete"
                  type="button"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </main>
      <button className="fab" onClick={() => setCreating(true)} aria-label="New job">
        <Icon name="add" size={24} strokeWidth={2.25} />
      </button>
      {creating && <JobModal onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <JobModal job={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function JobModal({ job = null, onClose, onSaved }) {
  const [name, setName] = useState(job?.name || '');
  const [client, setClient] = useState(job?.client || '');
  const [location, setLocation] = useState(job?.location || '');
  const [notes, setNotes] = useState(job?.notes || '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    if (job) {
      await updateJob(job.id, {
        name: name.trim(),
        client: client.trim(),
        location: location.trim(),
        notes,
      });
      toast.show('Job updated');
    } else {
      const created = await createJob({
        name: name.trim(),
        client: client.trim(),
        location: location.trim(),
        notes,
      });
      onSaved();
      onClose();
      nav(`/job/${created.id}`);
      return;
    }
    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{job ? 'Edit job' : 'New job'}</h2>
        <div className="field">
          <label>Job name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Plant — May 2026"
            autoFocus
          />
        </div>
        <div className="field">
          <label>Client (optional)</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div className="field">
          <label>Location (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <label>Job notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="High-level notes for this job. Will be added to the export."
          />
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={submit}
            disabled={busy || !name.trim()}
          >
            {job ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function monogram(name) {
  if (!name) return '·';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function pl(n, word) { return n === 1 ? word : `${word}s`; }

export function fmtRelative(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}
```

- [ ] **Step 2: Add JobList styles to `src/styles.css`**

In the components section (after the EmptyState block), add:

```css
/* Hero (page-title block, used by all top-level screens) */
.hero { padding: var(--sp-3) 0 var(--sp-4); }
.hero-pretitle {
  font-family: var(--font-ui);
  font-weight: 600;
  font-size: var(--fs-label);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.hero-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-display-l);
  letter-spacing: -0.01em;
  margin: 2px 0 0;
  color: var(--text-strong);
  line-height: 1.1;
}
.hero-title .accent { color: var(--energy); }
.build-badge {
  font-size: 9px;
  font-weight: 500;
  color: var(--text-dim);
  background: var(--bg-3);
  padding: 1px 6px;
  border-radius: var(--r-pill);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0;
  text-transform: none;
}

/* Search input with leading icon */
.search-wrap { position: relative; margin-bottom: var(--sp-3); }
.search-wrap .search-icon {
  position: absolute;
  left: var(--sp-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  pointer-events: none;
}
.search-bar--with-icon { padding-left: 36px; }

/* Stat tiles */
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-2);
  margin-bottom: var(--sp-4);
}
.stat-tile {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3);
}
.stat-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}
.stat-val {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-display-s);
  color: var(--text-strong);
  line-height: 1.1;
  margin-top: 2px;
}

/* Job card */
.job-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-3);
  margin-bottom: var(--sp-2);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.job-card:hover { border-color: var(--accent); box-shadow: var(--shadow-sm); }
.job-monogram {
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  background: var(--bg-3);
  color: var(--text);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.job-grow { flex: 1; min-width: 0; }
.job-title {
  font-weight: 600;
  font-size: var(--fs-body);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-sub {
  font-size: var(--fs-caption);
  color: var(--text-dim);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.job-actions .icon-btn {
  background: transparent;
  border: none;
  padding: var(--sp-2);
  color: var(--text-dim);
  border-radius: var(--r-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.job-actions .icon-btn:hover { background: var(--bg-3); color: var(--text); }
.job-actions .icon-btn.danger:hover { color: var(--danger); }

/* Modal title (slab) */
.modal-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-display-m);
  letter-spacing: -0.005em;
  color: var(--text-strong);
  margin: 0 0 var(--sp-3);
}
```

- [ ] **Step 3: Build and run dev server**

```bash
npm run build && npm run dev
```

Open `http://localhost:5173/e-OIC/`. Expected: JobList shows the slab "Your jobs" hero, three stat tiles, monogram-prefixed job cards, orange FAB. No console errors. Stop dev server.

- [ ] **Step 4: Run e2e**

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobList.jsx src/styles.css
git commit -m "feat(ui): JobList — slab hero, stat tiles, monogram cards"
```

---

## Task 7: SheetPicker bottom-sheet component

**Files:**
- Create: `src/components/SheetPicker.jsx`
- Modify: `src/styles.css` (add `.sheet-picker` styles)

- [ ] **Step 1: Create `src/components/SheetPicker.jsx`**

```jsx
import React from 'react';
import Icon from './Icon.jsx';

// Bottom-sheet picker for sheet selection.
//
// Props:
//   sheets: [{ id: string, name: string, status: 'empty'|'partial'|'complete', counts: { rows: number, total: number } }]
//   activeId: string
//   onPick: (sheetId) => void
//   onClose: () => void

export default function SheetPicker({ sheets, activeId, onPick, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet-picker" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-picker-grip" aria-hidden="true" />
        <h2 className="modal-title">All sheets</h2>
        <div className="sheet-picker-list">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sheet-picker-row${s.id === activeId ? ' active' : ''}`}
              onClick={() => { onPick(s.id); onClose(); }}
            >
              <span className={`sheet-picker-dot ${s.status}`} aria-hidden="true" />
              <span className="sheet-picker-name">{s.name}</span>
              <span className="sheet-picker-counts">
                {s.counts.rows}/{s.counts.total}
              </span>
              <Icon name="next" size={16} className="sheet-picker-chev" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SheetPicker styles to `src/styles.css`**

In the components section, add:

```css
/* SheetPicker (bottom sheet) */
.sheet-picker {
  background: var(--bg-2);
  width: 100%;
  max-width: 500px;
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: var(--sp-2) var(--sp-4) max(var(--sp-5), env(safe-area-inset-bottom));
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: var(--shadow-md);
  animation: sheet-up 250ms ease-out;
}
@keyframes sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.sheet-picker-grip {
  width: 36px;
  height: 4px;
  background: var(--border-strong);
  border-radius: var(--r-pill);
  margin: 0 auto var(--sp-3);
}
.sheet-picker-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sheet-picker-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.sheet-picker-row:hover { background: var(--bg-3); }
.sheet-picker-row.active { background: var(--bg-3); border-color: var(--border); }
.sheet-picker-dot {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0;
}
.sheet-picker-dot.empty { background: var(--text-dim); }
.sheet-picker-dot.partial { background: var(--warn); }
.sheet-picker-dot.complete { background: var(--ok); }
.sheet-picker-name {
  flex: 1;
  font-weight: 500;
  font-size: var(--fs-body);
}
.sheet-picker-counts {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: var(--fs-caption);
  color: var(--text-dim);
}
.sheet-picker-chev { color: var(--text-dim); }
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/SheetPicker.jsx src/styles.css
git commit -m "feat(ui): SheetPicker bottom-sheet for all-sheets jump"
```

---

## Task 8: SaveBar component

**Files:**
- Create: `src/components/SaveBar.jsx`
- Modify: `src/styles.css` (add `.savebar` styles)

- [ ] **Step 1: Create `src/components/SaveBar.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Sticky "Save & next row →" action bar.
//
// Props:
//   onSaveAndNext: () => void
//   nextLabel: 'next' | 'new'  ('next' → "Save & next row →"; 'new' → "+ New row")
//   pulseSavedKey: any  — when this prop changes, the "Saved ✓" pill flashes
//                          for 1.2s. Pass a counter from the parent that bumps
//                          on every successful autosave.

export default function SaveBar({ onSaveAndNext, nextLabel = 'next', pulseSavedKey }) {
  const [showSaved, setShowSaved] = useState(false);
  const timerRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setShowSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSaved(false), 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pulseSavedKey]);

  return (
    <div className="savebar" role="region" aria-label="Save and continue">
      <div className={`savebar-saved${showSaved ? ' visible' : ''}`} aria-live="polite">
        <Icon name="check" size={14} strokeWidth={2.5} />
        <span>Saved</span>
      </div>
      <button
        type="button"
        className="savebar-cta"
        onClick={onSaveAndNext}
      >
        {nextLabel === 'new' ? (
          <>
            <Icon name="add" size={18} strokeWidth={2.25} />
            <span>New row</span>
          </>
        ) : (
          <>
            <span>Save &amp; next row</span>
            <Icon name="arrowRight" size={18} strokeWidth={2.25} />
          </>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add SaveBar styles to `src/styles.css`**

```css
/* SaveBar (sticky save & next) */
.savebar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding:
    var(--sp-2)
    max(env(safe-area-inset-right), var(--sp-3))
    max(var(--sp-2), env(safe-area-inset-bottom))
    max(env(safe-area-inset-left), var(--sp-3));
  background: linear-gradient(to top, var(--bg) 60%, rgba(0,0,0,0));
  pointer-events: none;
}
.savebar-saved {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--ok);
  border-radius: var(--r-pill);
  padding: 4px 10px;
  font-size: var(--fs-caption);
  font-weight: 600;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 200ms ease, transform 200ms ease;
}
.savebar-saved.visible {
  opacity: 1;
  transform: translateX(0);
}
.savebar-cta {
  pointer-events: auto;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  background: var(--energy);
  color: white;
  border: 1px solid var(--energy);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-pill);
  font-weight: 600;
  font-size: var(--fs-body);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: transform 50ms ease;
}
.savebar-cta:active { transform: scale(0.96); }
.savebar-cta:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/SaveBar.jsx src/styles.css
git commit -m "feat(ui): SaveBar with autosave pulse and save-and-next CTA"
```

---

## Task 9: Lightbox component (themed)

**Files:**
- Create: `src/components/Lightbox.jsx`
- Modify: `src/styles.css` (replace legacy `.lightbox` rules)
- Delete: `src/photoOverlay.js`

- [ ] **Step 1: Locate current Lightbox usage**

Run:

```bash
grep -rn "photoOverlay\|lightbox" src/ public/
```

Note every callsite. The redesigned Lightbox replaces the imperative `photoOverlay` API with a React component. Callsites must be updated in Task 13 (PhotoCapture / RowPhotos rewrite).

- [ ] **Step 2: Create `src/components/Lightbox.jsx`**

```jsx
import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Themed photo lightbox.
//
// Props:
//   photos: [{ id, blobUrl, gps?: { lat, lng } }]
//   index: number — which photo to show first
//   onClose: () => void
//   onDelete?: (photo) => void  — when present, shows a trash button

export default function Lightbox({ photos, index: initialIndex, onClose, onDelete }) {
  const [idx, setIdx] = useState(initialIndex || 0);
  const startX = useRef(null);
  const startY = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(photos.length - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (!photos.length) return null;
  const cur = photos[idx];

  function onTouchStart(e) {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
  }
  function onTouchEnd(e) {
    if (startX.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dy) > Math.abs(dx) * 1.5 && dy > 80) {
      onClose();
    } else if (dx > 60) {
      setIdx((i) => Math.max(0, i - 1));
    } else if (dx < -60) {
      setIdx((i) => Math.min(photos.length - 1, i + 1));
    }
    startX.current = null;
    startY.current = null;
  }

  return (
    <div
      className="lightbox"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img
        src={cur.blobUrl}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />

      <button
        className="lightbox-btn lightbox-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        type="button"
      >
        <Icon name="close" size={20} strokeWidth={2} />
      </button>

      {cur.gps && (
        <div
          className="lightbox-gps"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="gps" size={14} />
          <span>
            {cur.gps.lat.toFixed(5)}, {cur.gps.lng.toFixed(5)}
          </span>
        </div>
      )}

      {onDelete && (
        <button
          className="lightbox-btn lightbox-delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(cur);
            // After deletion, advance to the next photo or close.
            if (photos.length === 1) onClose();
            else setIdx((i) => Math.min(i, photos.length - 2));
          }}
          aria-label="Delete photo"
          type="button"
        >
          <Icon name="trash" size={18} strokeWidth={2} />
        </button>
      )}

      {photos.length > 1 && (
        <div
          className="lightbox-counter"
          onClick={(e) => e.stopPropagation()}
        >
          {idx + 1} / {photos.length}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace legacy `.lightbox` rules in `src/styles.css`**

Find the legacy `.lightbox`, `.lightbox img`, `.lightbox .close` rules and **delete** them. Add to the components section:

```css
/* Lightbox */
.lightbox {
  position: fixed;
  inset: 0;
  background: var(--lightbox-bg);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadein 150ms ease;
  -webkit-touch-callout: none;
  user-select: none;
}
.lightbox img {
  max-width: 95vw;
  max-height: 90vh;
  object-fit: contain;
  touch-action: pinch-zoom;
}
.lightbox-btn {
  position: absolute;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.18);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lightbox-btn:hover { background: rgba(255, 255, 255, 0.18); }
.lightbox-close {
  top: max(var(--sp-4), env(safe-area-inset-top));
  right: var(--sp-4);
}
.lightbox-delete {
  bottom: max(var(--sp-4), env(safe-area-inset-bottom));
  right: var(--sp-4);
}
.lightbox-gps {
  position: absolute;
  top: max(var(--sp-4), env(safe-area-inset-top));
  left: var(--sp-4);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  background: rgba(0, 0, 0, 0.55);
  color: white;
  font-size: var(--fs-caption);
  padding: 6px 10px;
  border-radius: var(--r-pill);
}
.lightbox-counter {
  position: absolute;
  bottom: max(var(--sp-4), env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.55);
  color: white;
  font-size: var(--fs-caption);
  padding: 4px 12px;
  border-radius: var(--r-pill);
}
```

- [ ] **Step 4: Delete `src/photoOverlay.js`**

```bash
git rm src/photoOverlay.js
```

If the deletion fails because callsites still import it, **stop**. The next task migrates those callsites. For this task, leave the file in place if callsites still import it; in that case skip the delete and only add the Lightbox component. The delete will happen in Task 13 alongside the callsite update.

(After the grep in Step 1, you already know whether anything imports `photoOverlay`. If yes, defer the delete; if no, run `git rm`.)

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: build succeeds. If `photoOverlay.js` is gone, ensure no callsite still imports it.

- [ ] **Step 6: Commit**

```bash
git add src/components/Lightbox.jsx src/styles.css src/photoOverlay.js 2>/dev/null
git commit -m "feat(ui): themed Lightbox component"
```

---

## Task 10: JobView screen redesign (tabs + sheet picker)

**Files:**
- Modify: `src/components/JobView.jsx`
- Modify: `src/styles.css` (refine `.tabs`, `.tab`)

This is the largest screen rewrite. Read the existing file end-to-end before starting; the redesign preserves all logic and just rebuilds the chrome.

- [ ] **Step 1: Read the existing `src/components/JobView.jsx` thoroughly**

```bash
cat src/components/JobView.jsx
```

Note its props, state, sheet/row management, and integration with `SheetForm`. The redesign keeps every internal API the same; only header, tabs, and styling change.

- [ ] **Step 2: Replace `src/components/JobView.jsx`**

The exact code depends on the existing structure, but the redesign follows this pattern. Apply these specific changes to the existing component:

1. **Header**: Replace the existing `<header className="appbar">…</header>` block with:
   ```jsx
   <AppBar
     onBack={() => nav('/')}
     wordmark={job?.name || 'e-OIC'}
     crumb={panel?.name}
     actions={
       <>
         <button
           className="icon-btn"
           onClick={() => setShowExport(true)}
           aria-label="Export"
           type="button"
         >
           <Icon name="download" size={20} />
         </button>
         <button
           className="icon-btn"
           onClick={() => setShowMenu(true)}
           aria-label="More"
           type="button"
         >
           <Icon name="more" size={20} />
         </button>
       </>
     }
   />
   ```
   Ensure `AppBar` and `Icon` are imported. Move existing export/menu state and modals into the component if they aren't already.

2. **Hero block**: Above the sheet tabs, render:
   ```jsx
   <div className="hero">
     <div className="hero-pretitle">
       PANEL · {currentSheetIndex + 1} OF {totalSheets} SHEETS
     </div>
     <h1 className="hero-title">{panel?.name || 'Loading…'}</h1>
   </div>
   ```
   Where `currentSheetIndex` and `totalSheets` derive from the existing sheet array.

3. **Tabs**: Replace the existing tab markup. Use **single status dot per tab** (no per-row dots), and **append a trailing "All sheets" overflow button**:
   ```jsx
   <div className="tabs">
     {sheets.map((s) => (
       <button
         key={s.id}
         type="button"
         className={`tab${s.id === activeSheetId ? ' active' : ''}`}
         onClick={() => setActiveSheetId(s.id)}
       >
         <span className={`dot ${sheetStatus(s)}`} aria-hidden="true" />
         <span>{s.shortName || s.name}</span>
       </button>
     ))}
     <button
       type="button"
       className="tab tab--overflow"
       onClick={() => setShowSheetPicker(true)}
       aria-label="All sheets"
     >
       <Icon name="grid" size={14} />
     </button>
   </div>
   ```

4. **Sheet picker**: Add at the bottom of the component:
   ```jsx
   {showSheetPicker && (
     <SheetPicker
       sheets={sheetsForPicker}
       activeId={activeSheetId}
       onPick={(id) => setActiveSheetId(id)}
       onClose={() => setShowSheetPicker(false)}
     />
   )}
   ```
   Where `sheetsForPicker` maps each sheet to `{ id, name, status: sheetStatus(s), counts: { rows, total } }`.

5. **Helper**: Add a `sheetStatus(s)` helper that returns `'empty' | 'partial' | 'complete'` based on the current per-sheet completion logic (existing in the file; keep its math, just change the return values).

6. **Imports**: Add at the top:
   ```jsx
   import AppBar from './AppBar.jsx';
   import Icon from './Icon.jsx';
   import SheetPicker from './SheetPicker.jsx';
   import EmptyState from './EmptyState.jsx';
   ```

7. **Empty state for no rows**: Wherever the file currently renders an empty-rows message, replace with:
   ```jsx
   <EmptyState
     icon="add"
     title="No rows yet"
     body={`Tap "+ Add row" below to start filling out the ${activeSheet?.name || 'sheet'}.`}
     pointTo="fab"
   />
   ```

- [ ] **Step 3: Refine tab styles in `src/styles.css`**

Find the legacy `.tabs` and `.tab` rules and update them to (replacing the legacy block; the LEGACY block can have these removed since we now own them):

```css
/* Sheet tabs */
.tabs {
  display: flex;
  gap: var(--sp-1);
  overflow-x: auto;
  padding: 2px 0 var(--sp-2);
  margin-bottom: var(--sp-3);
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 6px 10px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text);
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  font-family: inherit;
  transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
}
.tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-on);
}
.tab .dot {
  flex: 0 0 6px;
  width: 6px;
  height: 6px;
  min-width: 6px;
  min-height: 6px;
  border-radius: 50%;
  align-self: center;
}
.tab .dot.empty { background: var(--text-dim); opacity: 0.6; }
.tab .dot.partial { background: var(--warn); }
.tab .dot.complete { background: var(--ok); }
.tab.active .dot.complete { background: var(--accent-on); }
.tab.active .dot.partial { background: var(--accent-on); }
.tab.active .dot.empty { background: rgba(255,255,255,0.6); }
.tab--overflow {
  padding: 6px 8px;
  color: var(--text-dim);
}
.tab--overflow:hover { color: var(--text); }
```

- [ ] **Step 4: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Open the app, create a new job (or use the seeded sample), navigate into a panel, switch sheets, tap "All sheets" overflow, jump to a sheet via the picker. Expected: all flows work, slab panel title renders, single-dot tabs are visible. Stop dev server.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobView.jsx src/styles.css
git commit -m "feat(ui): JobView — slab title, refined tabs, all-sheets picker"
```

---

## Task 11: SheetForm + SaveBar integration

**Files:**
- Modify: `src/components/SheetForm.jsx`
- Modify: `src/styles.css` (refine field/card/group styles)

- [ ] **Step 1: Read the existing `src/components/SheetForm.jsx`**

```bash
cat src/components/SheetForm.jsx
```

Identify: per-row autosave path, "next row" navigation logic, group rendering, field-type dispatch (text/enum/checkbox/photo).

- [ ] **Step 2: Add SaveBar integration**

In `SheetForm.jsx`:

1. Import:
   ```jsx
   import SaveBar from './SaveBar.jsx';
   import Icon from './Icon.jsx';
   ```

2. Maintain a `savePulse` state that bumps on each successful autosave commit:
   ```jsx
   const [savePulse, setSavePulse] = useState(0);
   // …in your existing autosave-on-blur handler, after the awaited save:
   setSavePulse((n) => n + 1);
   ```

3. Determine `nextLabel` and `onSaveAndNext`:
   ```jsx
   const hasNextRow = currentRowIndex < rows.length - 1;
   function handleSaveAndNext() {
     // Force-blur the active input so its onBlur autosave fires.
     if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
       document.activeElement.blur();
     }
     if (hasNextRow) {
       setActiveRowId(rows[currentRowIndex + 1].id);
     } else {
       // Create a new row inline using whatever existing add-row helper the file has.
       addRow();
     }
   }
   ```

4. Render `<SaveBar>` at the very end of the component's returned JSX (so it sits on top, fixed-positioned):
   ```jsx
   <SaveBar
     onSaveAndNext={handleSaveAndNext}
     nextLabel={hasNextRow ? 'next' : 'new'}
     pulseSavedKey={savePulse}
   />
   ```

5. **Replace the current FAB** (if SheetForm renders one for "+ add row") — the SaveBar's "+ New row" mode replaces it. Remove duplicate add-row buttons.

- [ ] **Step 3: Refine field/card styles in `src/styles.css`**

Update or add in the components section:

```css
/* Field (form input + label + hint) */
.field { margin-bottom: var(--sp-3); }
.field label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.field input,
.field select,
.field textarea {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  outline: none;
  color: var(--text);
  transition: border-color 150ms ease;
}
.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--energy-soft);
}
.field textarea { resize: vertical; min-height: 60px; }
.field-hint {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 3px;
}
.field input::placeholder, .field textarea::placeholder {
  color: var(--text-dim);
  opacity: 0.65;
}

/* Custom checkbox */
.field-checkbox {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}
.field-checkbox input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--ok);
  cursor: pointer;
}
.field-checkbox label {
  margin: 0;
  text-transform: none;
  letter-spacing: 0;
  font-size: var(--fs-body);
  color: var(--text);
  font-weight: 500;
  cursor: pointer;
}

/* Refined group/card */
.group {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  margin-bottom: var(--sp-2);
  overflow: hidden;
  transition: border-color 150ms ease;
}
.group-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-3);
  cursor: pointer;
  user-select: none;
  background: transparent;
}
.group-head .name {
  flex: 1;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  color: var(--text-strong);
  letter-spacing: -0.005em;
}
.group-head .count {
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 600;
  background: var(--bg-3);
  padding: 2px 8px;
  border-radius: var(--r-pill);
}
.group-body {
  padding: 0 var(--sp-3) var(--sp-3);
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 4: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Manual check: open a row, type into a field, blur the field. The "Saved ✓" pill should flash next to the SaveBar. Tap "Save & next row →" — focus advances to the next row. On the last row, the button morphs to "+ New row".

Stop dev server.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/SheetForm.jsx src/styles.css
git commit -m "feat(ui): SheetForm — refined fields, sticky save-and-next bar"
```

---

## Task 12: PanelView screen redesign

**Files:**
- Modify: `src/components/PanelView.jsx`

- [ ] **Step 1: Update PanelView to use AppBar + hero pattern**

Open `src/components/PanelView.jsx` and change:

1. Replace the existing header with `<AppBar onBack={…} wordmark={job?.name} crumb="Panel details" />`.
2. Replace any plain `<h1>` page title with the hero block (same pattern as JobList):
   ```jsx
   <div className="hero">
     <div className="hero-pretitle">PANEL · METADATA</div>
     <h1 className="hero-title">{panel?.name || 'New panel'}</h1>
   </div>
   ```
3. Replace any `.empty` div with `<EmptyState …>` if applicable.
4. Imports:
   ```jsx
   import AppBar from './AppBar.jsx';
   import Icon from './Icon.jsx';
   import EmptyState from './EmptyState.jsx';
   ```
5. Preserve all data logic (load/save panel, navigation to sheets).

- [ ] **Step 2: Build, dev-test**

```bash
npm run build && npm run dev
```

Navigate JobList → tap a job → if it routes to PanelView (depends on existing flow), verify it renders without errors.

Stop dev server.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/PanelView.jsx
git commit -m "feat(ui): PanelView — AppBar + slab hero"
```

---

## Task 13: Photo screens (Capture, Checklist, RowPhotos)

**Files:**
- Modify: `src/components/PhotoCapture.jsx`
- Modify: `src/components/PhotoChecklist.jsx`
- Modify: `src/components/RowPhotos.jsx`
- Delete: `src/photoOverlay.js` (if not already deleted in Task 9)
- Modify: `src/styles.css` (refine `.photo-grid`, `.photo-tile`, `.photo-checklist-item`)

- [ ] **Step 1: Migrate Lightbox callsites**

```bash
grep -rn "photoOverlay" src/
```

For each callsite, replace the imperative call with the React component:

- Replace `import { showPhoto } from '../photoOverlay.js'` → use a piece of state in the parent component (e.g. `const [lightbox, setLightbox] = useState(null)`).
- Where the old code called `showPhoto(blobUrl)`, instead set `setLightbox({ photos: [...], index: 0 })`.
- At the bottom of the parent's JSX, render:
  ```jsx
  {lightbox && (
    <Lightbox
      photos={lightbox.photos}
      index={lightbox.index}
      onClose={() => setLightbox(null)}
      onDelete={lightbox.onDelete}
    />
  )}
  ```

- [ ] **Step 2: Update PhotoChecklist UI**

In `src/components/PhotoChecklist.jsx`:

1. Replace the existing list rendering with checklist rows that use a custom checkbox visual:
   ```jsx
   <div className={`checklist-row${item.done ? ' done' : ''}`} onClick={() => onToggle(item)}>
     <span className="checklist-cb" aria-hidden="true">
       {item.done && <Icon name="check" size={12} strokeWidth={3} />}
     </span>
     <span className="checklist-name">{item.name}</span>
     <span className="checklist-count">{item.count}</span>
   </div>
   ```
2. Add a slab subhead above the recent-photos grid:
   ```jsx
   <div className="section-label">Recent</div>
   ```
3. Imports: `Icon`.

- [ ] **Step 3: Update PhotoCapture UI**

In `src/components/PhotoCapture.jsx`:

1. Replace any `📷` / `❌` emoji buttons with `<Icon name="camera" />` / `<Icon name="close" />`.
2. Wherever full-size photos are shown, switch to the new `<Lightbox>` (per Step 1).
3. Remove the in-modal `.debug-strip` console output if it's still there (no longer needed; we have Settings).
4. Preserve the iOS-specific input handling (`HIDDEN_INPUT_STYLE`, deferred reset) verbatim. These are load-bearing.

- [ ] **Step 4: Update RowPhotos UI**

In `src/components/RowPhotos.jsx`:

1. Replace the photo grid markup to use refined classes:
   ```jsx
   <div className="photo-grid">
     {photos.map((p, i) => (
       <div key={p.id} className="photo-tile" onClick={() => setLightbox({ photos, index: i, onDelete })}>
         <img src={p.blobUrl} alt="" />
         {p.gps && (
           <div className="photo-tile-gps">
             <Icon name="gps" size={10} />
             <span>{p.gps.lat.toFixed(3)},{p.gps.lng.toFixed(3)}</span>
           </div>
         )}
       </div>
     ))}
     <button className="photo-tile photo-tile--add" onClick={onAddPhoto} aria-label="Add photo" type="button">
       <Icon name="add" size={22} strokeWidth={1.75} />
     </button>
   </div>
   ```
2. Add `<Lightbox>` rendering at the bottom (per Step 1).

- [ ] **Step 5: Replace photo styles in `src/styles.css`**

Replace the legacy `.photo-grid`, `.photo-tile`, `.photo-tile .del`, `.photo-tile .gps`, `.photo-checklist-item` rules with:

```css
/* Photo grid + tiles */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-1);
}
.photo-tile {
  position: relative;
  aspect-ratio: 1;
  background: var(--bg-3);
  border-radius: var(--r-sm);
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-family: inherit;
}
.photo-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.photo-tile-gps {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: var(--r-sm);
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 500;
}
.photo-tile--add {
  border-style: dashed;
  border-color: var(--border-strong);
  background: transparent;
  color: var(--text-dim);
  transition: color 150ms ease, border-color 150ms ease;
}
.photo-tile--add:hover {
  color: var(--energy);
  border-color: var(--energy);
}

/* Photo checklist */
.checklist-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  margin-bottom: 4px;
  cursor: pointer;
  transition: border-color 150ms ease;
}
.checklist-row:hover { border-color: var(--accent); }
.checklist-cb {
  width: 18px;
  height: 18px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
  background: transparent;
}
.checklist-row.done .checklist-cb {
  background: var(--ok);
  border-color: var(--ok);
}
.checklist-name {
  flex: 1;
  font-weight: 500;
  font-size: var(--fs-body);
}
.checklist-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--bg-3);
  padding: 2px 8px;
  border-radius: var(--r-pill);
}

/* Section label (slab small caps) */
.section-label {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 13px;
  color: var(--text-dim);
  margin: var(--sp-4) 0 var(--sp-2);
  letter-spacing: -0.005em;
}
```

- [ ] **Step 6: Delete `src/photoOverlay.js`**

```bash
git rm src/photoOverlay.js 2>/dev/null
```

If `git rm` fails because the file was already removed in Task 9, skip.

- [ ] **Step 7: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Manual check: navigate to a panel, take/import a photo, tap the photo tile to open the themed lightbox, swipe between photos, close. Stop dev.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add src/components/PhotoCapture.jsx src/components/PhotoChecklist.jsx src/components/RowPhotos.jsx src/styles.css
git commit -m "feat(ui): photo screens — Lucide icons, themed lightbox, refined grid"
```

---

## Task 14: ExportDialog redesign

**Files:**
- Modify: `src/components/ExportDialog.jsx`
- Modify: `src/styles.css` (add `.export-progress` styles)

- [ ] **Step 1: Read the existing `src/components/ExportDialog.jsx`**

```bash
cat src/components/ExportDialog.jsx
```

Note its props (job, onClose), the export pipeline it calls, and any existing progress state.

- [ ] **Step 2: Rewrite as a bottom-sheet with progress states**

Replace the dialog body with:

```jsx
import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { exportJobZip } from '../exporter.js';
import { toast } from '../lib/toast.js';

export default function ExportDialog({ job, onClose }) {
  const [stage, setStage] = useState('config'); // 'config' | 'generating' | 'done' | 'error'
  const [progress, setProgress] = useState('');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeJson, setIncludeJson] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [filename, setFilename] = useState(null);

  async function generate() {
    setStage('generating');
    try {
      setProgress('Building xlsx…');
      const result = await exportJobZip(job.id, {
        includePhotos,
        includeJson,
        onProgress: (p) => setProgress(p),
      });
      setDownloadUrl(result.url);
      setFilename(result.filename);
      setStage('done');
    } catch (err) {
      console.error(err);
      toast.show('Export failed: ' + err.message, { kind: 'error' });
      setStage('error');
    }
  }

  function shareOrDownload() {
    if (navigator.share && downloadUrl) {
      // The Web Share API can't share blob URLs directly on iOS; fall back
      // to a regular download anchor and let the user pick a destination.
    }
    // Trigger a regular download.
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="modal-bg" onClick={stage === 'generating' ? undefined : onClose}>
      <div className="export-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-picker-grip" aria-hidden="true" />
        <h2 className="modal-title">Export job</h2>

        {stage === 'config' && (
          <>
            <div className="export-summary">
              <div><strong>{job.name}</strong></div>
              <div className="export-summary-sub">Will create a .zip with the xlsx{includePhotos ? ' and photos' : ''}.</div>
            </div>
            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
              />
              <span>Include photos</span>
            </label>
            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={includeJson}
                onChange={(e) => setIncludeJson(e.target.checked)}
              />
              <span>Include JSON snapshot (advanced)</span>
            </label>
            <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-3)' }}>
              <button className="ghost" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={generate}>
                <Icon name="download" size={16} />
                <span style={{ marginLeft: 6 }}>Generate .zip</span>
              </button>
            </div>
          </>
        )}

        {stage === 'generating' && (
          <div className="export-progress">
            <div className="export-spinner" />
            <div className="export-progress-text">{progress || 'Working…'}</div>
          </div>
        )}

        {stage === 'done' && (
          <>
            <div className="export-progress export-progress--done">
              <div className="export-check"><Icon name="check" size={28} strokeWidth={2.5} /></div>
              <div className="export-progress-text">Ready: {filename}</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Done</button>
              <button className="primary" onClick={shareOrDownload}>
                <Icon name="download" size={16} />
                <span style={{ marginLeft: 6 }}>Save / Share…</span>
              </button>
            </div>
          </>
        )}

        {stage === 'error' && (
          <>
            <div className="export-progress export-progress--error">
              <Icon name="warn" size={28} />
              <div className="export-progress-text">Export failed.</div>
            </div>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" onClick={() => setStage('config')}>
                <Icon name="refresh" size={16} />
                <span style={{ marginLeft: 6 }}>Try again</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**Important:** the actual `exportJobZip` signature in `src/exporter.js` may differ. Check the existing call in the original `ExportDialog.jsx` and **preserve that exact signature**; only the surrounding UI changes. If the existing exporter doesn't accept `onProgress`, drop the progress callback and just toggle stages on resolve/reject.

- [ ] **Step 3: Add export styles to `src/styles.css`**

```css
/* Export sheet */
.export-sheet {
  background: var(--bg-2);
  width: 100%;
  max-width: 500px;
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: var(--sp-2) var(--sp-4) max(var(--sp-5), env(safe-area-inset-bottom));
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-md);
  animation: sheet-up 250ms ease-out;
}
.export-summary {
  background: var(--bg-3);
  border-radius: var(--r-md);
  padding: var(--sp-3);
  margin-bottom: var(--sp-3);
  font-size: var(--fs-body);
}
.export-summary-sub {
  font-size: var(--fs-caption);
  color: var(--text-dim);
  margin-top: 2px;
}
.export-progress {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-5) var(--sp-3);
  justify-content: center;
  flex-direction: column;
  text-align: center;
}
.export-progress-text {
  font-size: var(--fs-body);
  color: var(--text);
  font-weight: 500;
}
.export-spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--bg-3);
  border-top-color: var(--energy);
  animation: spin 800ms linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.export-check {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--ok);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}
.export-progress--error { color: var(--danger); }
.export-progress--error .export-progress-text { color: var(--danger); }
```

- [ ] **Step 4: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Open the export dialog from JobView, generate, verify progress UI, then download the zip and confirm it opens correctly in Excel (manual check). Stop dev.

```bash
npm run test:e2e
```

Expected: passes (the e2e test exercises the same export pipeline).

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportDialog.jsx src/styles.css
git commit -m "feat(ui): ExportDialog — bottom sheet with progress states"
```

---

## Task 15: SettingsView redesign

**Files:**
- Modify: `src/components/SettingsView.jsx`

- [ ] **Step 1: Read the existing `src/components/SettingsView.jsx`**

```bash
cat src/components/SettingsView.jsx
```

Identify each existing setting (theme, GPS, sample-job reload, backup, clear-data, build version, storage estimate). The redesign keeps every setting; it reorganizes them into three slab-headed sections.

- [ ] **Step 2: Rebuild as three-section layout**

Replace the body of `SettingsView` with this structure (preserving all existing handlers — wire them to the new buttons exactly the same way):

```jsx
import React, { useState, useEffect } from 'react';
import AppBar from './AppBar.jsx';
import Icon from './Icon.jsx';
import { nav } from '../App.jsx';
import { BUILD_VERSION } from '../version.js';
import { saveTheme } from '../lib/theme.js';
import { getSetting, setSetting, getStorageEstimate, exportAllJSON, importJSON, clearAll } from '../db.js';
import { reloadSampleJob } from '../lib/seed.js';
import { toast } from '../lib/toast.js';

export default function SettingsView() {
  const [theme, setTheme] = useState('auto');
  const [gpsConsent, setGpsConsent] = useState(null);
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    (async () => {
      setTheme((await getSetting('theme')) || 'auto');
      setGpsConsent(await getSetting('geolocationConsent'));
      setStorage(await getStorageEstimate());
    })();
  }, []);

  async function pickTheme(value) {
    setTheme(value);
    await saveTheme(value);
  }

  async function toggleGps() {
    const next = gpsConsent === 'granted' ? 'denied' : 'granted';
    await setSetting('geolocationConsent', next);
    setGpsConsent(next);
  }

  async function onReloadSample() {
    await reloadSampleJob();
    toast.show('Sample job reloaded');
  }

  async function onExportBackup() {
    const snapshot = await exportAllJSON();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `e-oic-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onImportBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      await importJSON(data, { mode: 'merge' });
      toast.show('Backup imported');
    } catch (err) {
      toast.show('Import failed: ' + err.message, { kind: 'error' });
    }
  }

  async function onClearAll() {
    if (!confirm('Delete every job, panel, photo, and setting? This cannot be undone.')) return;
    await clearAll();
    toast.show('All data cleared');
    nav('/');
  }

  return (
    <>
      <AppBar onBack={() => nav('/')} wordmark="Settings" />
      <main>
        <div className="hero">
          <div className="hero-pretitle">PREFERENCES</div>
          <h1 className="hero-title">Settings</h1>
        </div>

        <section className="settings-card">
          <h2 className="settings-section">Display</h2>
          <div className="setting-row">
            <div className="setting-label">Theme</div>
            <div className="seg-control">
              <button
                type="button"
                className={`seg-option${theme === 'auto' ? ' active' : ''}`}
                onClick={() => pickTheme('auto')}
              >
                <Icon name="themeAuto" size={14} />
                <span>Auto</span>
              </button>
              <button
                type="button"
                className={`seg-option${theme === 'light' ? ' active' : ''}`}
                onClick={() => pickTheme('light')}
              >
                <Icon name="themeLight" size={14} />
                <span>Light</span>
              </button>
              <button
                type="button"
                className={`seg-option${theme === 'dark' ? ' active' : ''}`}
                onClick={() => pickTheme('dark')}
              >
                <Icon name="themeDark" size={14} />
                <span>Dark</span>
              </button>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-label">Build</div>
            <span className="build-badge">{BUILD_VERSION}</span>
          </div>
        </section>

        <section className="settings-card">
          <h2 className="settings-section">Capture</h2>
          <div className="setting-row">
            <div className="setting-label">GPS on photos</div>
            <button
              type="button"
              className={`toggle${gpsConsent === 'granted' ? ' on' : ''}`}
              onClick={toggleGps}
              aria-pressed={gpsConsent === 'granted'}
            >
              <span className="toggle-thumb" />
            </button>
          </div>
        </section>

        <section className="settings-card">
          <h2 className="settings-section">Data</h2>
          {storage && (
            <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div className="setting-label">Storage</div>
              <div className="storage-bar">
                <div
                  className="storage-bar-fill"
                  style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }}
                />
              </div>
              <div className="storage-stats">
                {fmtBytes(storage.usage)} of {fmtBytes(storage.quota)} used
              </div>
            </div>
          )}
          <div className="setting-row">
            <button className="ghost" onClick={onReloadSample}>
              <Icon name="refresh" size={14} />
              <span style={{ marginLeft: 6 }}>Reload sample job</span>
            </button>
          </div>
          <div className="setting-row">
            <button className="ghost" onClick={onExportBackup}>
              <Icon name="download" size={14} />
              <span style={{ marginLeft: 6 }}>Export backup</span>
            </button>
            <label className="ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
              <Icon name="image" size={14} />
              <span style={{ marginLeft: 6 }}>Import backup</span>
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={onImportBackup}
              />
            </label>
          </div>
          <div className="setting-row">
            <button className="danger ghost" onClick={onClearAll}>
              <Icon name="trash" size={14} />
              <span style={{ marginLeft: 6 }}>Clear all data</span>
            </button>
          </div>
        </section>

        <footer className="settings-footer">
          <div className="settings-footer-mark" aria-hidden="true" />
          <div className="settings-footer-text">
            <strong>e-OIC</strong> · {BUILD_VERSION}
          </div>
          <div className="settings-footer-sub">An E Tech Group field tool.</div>
        </footer>
      </main>
    </>
  );
}

function fmtBytes(n) {
  if (!n) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
```

**If any imported function (`reloadSampleJob`, `getStorageEstimate`, `exportAllJSON`, `clearAll`) doesn't exist with that name in the existing codebase, use whatever name the existing `SettingsView.jsx` already uses for that operation.** Do not invent new helper functions; use what's already there.

- [ ] **Step 3: Add Settings styles to `src/styles.css`**

```css
/* Settings */
.settings-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4) var(--sp-2);
  margin-bottom: var(--sp-3);
}
.settings-section {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  letter-spacing: -0.005em;
  color: var(--text-strong);
  margin: 0 0 var(--sp-2);
}
.setting-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--border);
}
.setting-row:first-of-type { border-top: none; }
.setting-label {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--text);
  font-weight: 500;
}

/* Segmented control */
.seg-control {
  display: inline-flex;
  background: var(--bg-3);
  border-radius: var(--r-pill);
  padding: 2px;
  gap: 2px;
}
.seg-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: transparent;
  border: none;
  border-radius: var(--r-pill);
  cursor: pointer;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: var(--text-dim);
}
.seg-option.active {
  background: var(--bg-2);
  color: var(--text-strong);
  box-shadow: var(--shadow-sm);
}

/* Toggle switch */
.toggle {
  width: 44px;
  height: 26px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  cursor: pointer;
  padding: 2px;
  display: inline-flex;
  align-items: center;
  transition: background 200ms ease;
}
.toggle-thumb {
  width: 20px;
  height: 20px;
  background: var(--bg-2);
  border-radius: 50%;
  box-shadow: var(--shadow-sm);
  transition: transform 200ms ease;
}
.toggle.on { background: var(--ok); border-color: var(--ok); }
.toggle.on .toggle-thumb { transform: translateX(18px); }

/* Storage bar */
.storage-bar {
  height: 6px;
  background: var(--bg-3);
  border-radius: var(--r-pill);
  overflow: hidden;
  margin-top: var(--sp-2);
}
.storage-bar-fill {
  height: 100%;
  background: var(--accent);
  transition: width 250ms ease;
}
.storage-stats {
  font-size: var(--fs-caption);
  color: var(--text-dim);
  margin-top: 4px;
}

/* Footer */
.settings-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--sp-6) 0;
  color: var(--text-dim);
  gap: var(--sp-1);
}
.settings-footer-mark {
  width: 32px;
  height: 32px;
  background-image: var(--mark-src);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.5;
  margin-bottom: var(--sp-2);
}
.settings-footer-text {
  font-family: var(--font-display);
  font-size: 14px;
}
.settings-footer-sub {
  font-size: var(--fs-caption);
}
```

- [ ] **Step 4: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Navigate to /settings, toggle theme between Auto/Light/Dark, toggle GPS, click each data button, verify storage bar reflects usage. Stop dev.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsView.jsx src/styles.css
git commit -m "feat(ui): SettingsView — three-section layout, segmented control"
```

---

## Task 16: Toast + GeoPrompt polish

**Files:**
- Modify: `src/components/ToastHost.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css` (refine `.toast`)

- [ ] **Step 1: Update ToastHost to use Lucide icons**

Open `src/components/ToastHost.jsx`. Wherever the toast renders an icon (e.g., a checkmark prefix or error icon), use `<Icon name="check" />` or `<Icon name="warn" />`. Preserve all timing, undo, and dismiss logic.

- [ ] **Step 2: Refresh `.toast` styles**

Replace the legacy `.toast`, `.toast.error`, `.toast .undo` rules with:

```css
/* Toast */
.toast-host {
  position: fixed;
  bottom: 110px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 300;
  pointer-events: none;
  width: max-content;
  max-width: 90vw;
}
.toast {
  pointer-events: auto;
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 10px 14px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  box-shadow: var(--shadow-md);
  font-size: var(--fs-body);
  animation: toast-in 250ms ease-out;
}
@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.toast.error { border-color: var(--danger); color: var(--danger); }
.toast .toast-icon { color: var(--ok); display: inline-flex; }
.toast.error .toast-icon { color: var(--danger); }
.toast .undo {
  background: transparent;
  color: var(--accent);
  border: none;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.toast .undo:hover { background: var(--bg-3); }
```

- [ ] **Step 3: Update `GeoPrompt` in `src/App.jsx`**

In `src/App.jsx`, replace the `<GeoPrompt>` component body's chrome with the same modal-title pattern:

```jsx
function GeoPrompt({ onClose }) {
  const [busy, setBusy] = useState(false);

  async function allow() {
    setBusy(true);
    const pos = await requestGeolocation({ timeout: 10000 });
    await setGeolocationConsent(pos ? 'granted' : 'denied');
    setBusy(false);
    onClose();
  }
  async function deny() {
    await setGeolocationConsent('denied');
    onClose();
  }

  return (
    <div className="modal-bg">
      <div className="modal">
        <h2 className="modal-title">Tag photos with location?</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 0 }}>
          The app can attach GPS coordinates to every photo you take, written into:
        </p>
        <ul style={{ color: 'var(--text-dim)', fontSize: 13, paddingLeft: 18 }}>
          <li>The visible overlay on each photo</li>
          <li>The JPEG's EXIF metadata (visible to mapping apps)</li>
          <li>A sidecar CSV included in your export</li>
        </ul>
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Your phone will ask for permission. You can change this anytime in Settings.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="ghost" onClick={deny} disabled={busy}>Not now</button>
          <button className="primary" onClick={allow} disabled={busy}>
            {busy ? 'Asking…' : 'Enable location'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

The change is purely cosmetic (slab title via `modal-title` class, capitalization tweaks); functionality unchanged.

- [ ] **Step 4: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Trigger a toast (e.g., delete a job and watch the undo toast). Stop dev.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/ToastHost.jsx src/App.jsx src/styles.css
git commit -m "feat(ui): toast + geo-prompt polish"
```

---

## Task 17: Cleanup — remove dead legacy CSS

**Files:**
- Modify: `src/styles.css`

By this point most legacy component blocks have been replaced inline (in their corresponding tasks). This task removes leftover legacy rules that no class name uses anymore.

- [ ] **Step 1: Inventory current class usage**

Run:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync('src/styles.css','utf8');
const classes = new Set([...css.matchAll(/\.([\w-]+)\b/g)].map(m => m[1]));
let used = new Set();
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(jsx?|html)$/.test(f)) {
      const txt = fs.readFileSync(p,'utf8');
      for (const cls of classes) {
        if (txt.match(new RegExp('[\\\"\\'\\\`\\\\s>=]' + cls + '(?:[\\\"\\'\\\`\\\\s\\\\.])'))) used.add(cls);
      }
    }
  }
}
walk('src'); walk('public');
const dead = [...classes].filter(c => !used.has(c));
console.log('Dead classes:', dead.sort().join(' '));
console.log('Total: ' + dead.length);
"
```

This prints all CSS classes whose name doesn't appear in any `.jsx`/`.html` file under `src/` or `public/`. The list is the safe-to-delete candidates.

- [ ] **Step 2: Remove only obviously-dead rules**

Open `src/styles.css`. For each class in the dead list above, find its rule(s) in the LEGACY block (the section after `/* ------ LEGACY ------ */`) and delete them. **Do not** delete tokens (`--bg`, etc.) or rules outside the LEGACY block. **Do not** delete classes whose names appear in the dead list but are constructed dynamically (e.g., `dot.${status}` builds class names like `dot.complete`).

Rules to never delete even if listed: any `@font-face`, any rule starting with `--`, any rule that's a token-only declaration.

- [ ] **Step 3: If the LEGACY block is now empty, remove it**

If the `/* ------ LEGACY (to be migrated) ------ */` marker has nothing after it, delete the marker line.

- [ ] **Step 4: Build, dev-test, e2e**

```bash
npm run build && npm run dev
```

Click through every screen (JobList → New Job → Sheet rows → Photos → Lightbox → Settings) and confirm nothing is unstyled. If anything looks broken, restore the corresponding legacy rule from git history (`git diff src/styles.css`). Stop dev.

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css
git commit -m "chore(ui): remove dead legacy CSS rules"
```

---

## Task 18: Bump build version, update SW precache, deploy

**Files:**
- Modify: `src/version.js`
- Modify: `public/service-worker.js`
- Modify: `SPEC.md`

- [ ] **Step 1: Bump `BUILD_VERSION`**

In `src/version.js`, change:

```js
export const BUILD_VERSION = 'v15';
```

- [ ] **Step 2: Update service worker**

In `public/service-worker.js`:

```js
const VERSION = 'v15';
const CACHE = `eoic-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './template.xlsx',
  './seed.json',
  './brand/mark-color.png',
  './brand/mark-white.png',
  './fonts/Montserrat-400.woff2',
  './fonts/Montserrat-500.woff2',
  './fonts/Montserrat-600.woff2',
  './fonts/Montserrat-700.woff2',
  './fonts/RobotoSlab-500.woff2',
  './fonts/RobotoSlab-600.woff2',
];
```

(The Choplin files are intentionally NOT in PRECACHE — they may not be present until licensed. The `font-display: swap` declaration handles the missing-font case gracefully.)

- [ ] **Step 3: Update SPEC.md version reference**

Find every line in `SPEC.md` that references `v14` and change to `v15`. Add a one-paragraph entry to whatever changelog or version-history section exists (or to the top of the file's "current state" section):

```
v15: Visual redesign — Choplin Editorial direction (E Tech Group brand kit). Slab-serif page titles, brand mark in app bar, Lucide icon set, themed lightbox, hybrid save model with sticky save-and-next bar, refreshed light/dark token palettes, EmptyState component. No data model changes.
```

- [ ] **Step 4: Final full build + e2e**

```bash
npm run build
```

Expected: build succeeds. Note the bundle size — should be only marginally larger than the previous build (icons + a few extra component files; CSS net change is small).

```bash
npm run test:e2e
```

Expected: passes.

- [ ] **Step 5: Visual sanity check via dev server**

```bash
npm run dev
```

Walk through every screen one final time:

1. JobList — slab "Your jobs" hero, stat tiles, monogram cards, orange FAB. Click +.
2. JobModal — slab "New job" title.
3. JobView — slab panel title, single-dot tabs, "All sheets" overflow → SheetPicker.
4. Row entry — fields with refined focus rings, sticky SaveBar. Type into a field, blur — Saved pill flashes. Tap Save & next — advance to next row.
5. Photos screen — checklist rows with custom check, photo grid, themed lightbox (tap a photo).
6. ExportDialog — bottom sheet with toggles, Generate, progress, download.
7. SettingsView — three cards, segmented theme control, GPS toggle, storage bar.
8. Theme switch (Auto/Light/Dark) — both palettes look correct.

Stop dev.

- [ ] **Step 6: Commit**

```bash
git add src/version.js public/service-worker.js SPEC.md
git commit -m "release: v15 — Choplin Editorial UI redesign"
```

- [ ] **Step 7: Push to origin/main (deploys to GitHub Pages)**

```bash
git push origin main
```

Expected: push succeeds. The `.github/workflows/deploy.yml` GitHub Action picks up the push to `main`, runs `npm ci && npm run build`, and publishes `dist/` to the `gh-pages` branch.

- [ ] **Step 8: Verify the workflow ran green**

```bash
gh run list --limit 3
```

Expected: latest run is "completed success" within ~2 minutes. If it failed, fetch the logs:

```bash
gh run view --log-failed
```

Address any failures (most likely a font download network issue from Task 1, Step 3 — re-download and re-push).

- [ ] **Step 9: Browser test on iPhone**

Open the live URL on iPhone Safari. Add to home screen. Open the PWA. Walk through the same checklist as Step 5. Specifically verify:

- Mark logo renders at the right size in the app bar (no rounded corners — the source PNG has the artwork's intrinsic geometry).
- Slab titles display (Roboto Slab fallback if Choplin not licensed).
- Save & next row animation feels right.
- Lightbox opens themed (not pure black).
- Theme auto-switches between light/dark following system setting.

If any iOS-specific bug surfaces (Safari layout quirk, font swap flash, gesture interception), file under "follow-up bugs" and fix in a follow-up commit. The app is considered live for testing once Step 8 passes.

---

## Self-review notes

- **Spec coverage check (after writing the plan):** Every section of the spec maps to a task — tokens (Task 2), iconography (Task 3), AppBar (4), EmptyState (5), JobList (6), SheetPicker (7), SaveBar (8), Lightbox (9), JobView (10), SheetForm (11), PanelView (12), Photos (13), ExportDialog (14), SettingsView (15), Toast/GeoPrompt (16), cleanup (17), version bump + deploy (18).
- **Choplin licensing:** documented in `public/fonts/README.md` (Task 1) and noted in SW precache (Task 18).
- **Microinteractions:** distributed across tasks (FAB press in Task 2 base, tab transitions in Task 10, save-pulse in Task 8, sheet slide-up in Task 7, toast-in animation in Task 16, prefers-reduced-motion in Task 2 base).
- **Empty states:** spec lists JobList/JobView/Photos. Implemented in Tasks 6, 10, 13.
- **Type consistency:** the SaveBar component name, Icon component name, and class names (`.hero`, `.stat-tile`, `.tab--overflow`, `.savebar`, `.lightbox-btn`, `.checklist-row`, `.export-sheet`, `.seg-control`, `.toggle`) are referenced consistently across tasks where they're used.
