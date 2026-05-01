# Demo Readiness Audit & Punch List

**Date:** 2026-05-01
**App version at audit:** v35
**Status:** Audit complete; user approved entire punch list (17 items). Ready for implementation planning.

## Demo context

- **Audience:** eTechGroup leadership, evaluating budget for SharePoint integration buy-in.
- **Day-to-day users:** internal eTech engineers (technical, today). Leadership demo is the imminent calibration target.
- **Demo type:** hands-on phone — leadership taps through; the "WOW" bar is "looks like a real product worth funding," not "feature-complete."
- **Recorded video for the deck:** out of scope here; user will build a separate demo recorder before the live presentation.
- **Bonus survival flash:** option C from scoping (install banner, GeoPrompt, GPS-on-photo, offline behavior) folded in as low-effort items.

## Demo journey (highest-fidelity path)

SharePoint round-trip story:
1. Open the installed PWA on a phone.
2. JobList → FAB → "Pull from xlsx" (`PullOrNewModal`).
3. `PullDialog` → file picker → parse → `DiffView` confirmation → new job created.
4. Tap into the new job (`JobView`).
5. Tap a panel → `SheetForm` row picker → fill rows.
6. `PhotoCapture` (live overlay).
7. JobView menu → "Re-sync from xlsx" → `ResyncDialog` diff → apply.
8. Export → `ExportDialog` (xlsx-only) → confirm push to target file.

## Punch list — all 17 items approved by user

### Demo blockers (5)

1. **Replace raw `prompt()` / `confirm()` on demo path.** `JobView.jsx:87` (panel duplicate prompt), `SettingsView.jsx:84,100` (restore + reload-sample confirms). Use the existing `modal-bg`/`modal` pattern; `JobView` Disconnect modal at lines 226–240 is a good reference. **Effort: ~90min total.**
2. **Kill stale `APP_VERSION = '1.1.0'` in `SettingsView.jsx`.** Settings footer renders both `BUILD_VERSION` (v35) and the leftover `APP_VERSION` constant side-by-side. Delete the constant + its rendering line. Footer should read `e-OIC · v35` and `An E Tech Group field tool.` **Effort: <5min.**
3. **Replace panel-row unicode glyph icons with Lucide.** `JobView.jsx:207-209` uses `✎ ⧉ ✕` raw text characters; lines 245, 247, 249 use `⬇ ↻ ⛓`. iOS renders these in the emoji font; looks cartoonish. Replace each with `<Icon name="edit|copy|trash" size={16} />` for panel rows; `<Icon name="download|refresh|link" />` for menu. **Effort: ~20min.**
4. **DiffView labels — use `rowDisplayLabel` everywhere.** `DiffView.jsx:149-154` falls back to `Object.keys(data).find(...)` debug logic and `(?)` placeholders. `src/lib/rowLabel.js` already provides the canonical label util used elsewhere in the app. Plumb it through DiffView for added/removed/modified rows; for rows without a primary-label column, render `<sheetName> · row <idx>`. Guarantee no `(?)` ever ships. **Effort: ~30min.**
5. **DiffView modified-row vertical layout.** `DiffView.jsx:68-80` + `styles.css:1742-1744` render `old → new` inline; long values wrap mid-arrow on phone. Restack as 2-row grid (red strike-through + green bold pills, vertical) or before/after badge stack. **Effort: ~60min.**

**Blocker subtotal: ~3.5 hours.**

### WOW upgrades — SharePoint moneyshot (4)

A. **DiffView renders sheet-note changes.** `DiffView.jsx:140-146` `countChanges` increments for `diff.sheetNotes.added/removed/modified` but the render path has no `sheetNotes` block — silent change today. Add a "Sheet notes" section after the Panels section, mirror Job-section styling, show old/new with strike-through. **Effort: ~45min.**
B. **PullDialog progress narration.** `PullDialog.jsx:118-123` shows a single bare spinner for 2–3 seconds on a real plant xlsx. Surface progress at sheet boundaries: `Found 8 panels…`, `Reading 142 rows…`, `Matching to schema…`. Requires a progress callback in `xlsxParser.js`. **Effort: ~90min.**
C. **PullDialog idle copy rewrite.** `PullDialog.jsx:105-108`. Replace with: `Bring an existing investigation in from SharePoint. We'll read the panels, rows, and notes — your data lives in the app, ready to update in the field.` **Effort: <5min.**
D. **ExportDialog push — directional ribbon.** `ExportDialog.jsx:222` reuses DiffView with `direction="push"` but visually it's identical to pull. Add a header ribbon `Pushing to <filename>` in `--energy` color so the user knows arrow direction. **Effort: ~30min.**

### WOW upgrades — JobList / JobView (4)

E. **Hide/relocate the JobList build-version badge.** `JobList.jsx:111` + `styles.css:384-394` — 9px monospace badge in the hero pretitle reads as `[debug: v35]`. Remove from pretitle (Settings already shows it). If a build identifier is desired in JobList at all, footer-corner with low opacity. **Effort: ~15min.**
F. **Skeleton states for JobView + PanelView first paint.** `JobView.jsx:117` and `PanelView.jsx:49` return `null` on cold IDB read, producing 200-300ms blank flashes. Render AppBar placeholder + 3 ghost panel rows while loading. **Effort: ~60min.**
G. **JobView panel names use `<Marquee>`.** `JobView.jsx:191` renders `<div className="title">{p.name}</div>` plain. JobList wraps job names in `<Marquee>` (`JobList.jsx:172`). Match the behavior so long panel names like `MCC-101 — Process Building West Wing` scroll. **Effort: <5min.**
H. **Duplicate toast — drop the apology.** `JobView.jsx:91`: `Duplicated as "X" (rows copied, photos not)` reads as a developer apology. Either copy photos (correct UX, Heavy) or trim the toast to `Duplicated as "X"` and let the empty-photo state telegraph the nuance. Default: trim the toast. **Effort: ~15min (toast); Heavy if implementing photo copy.**

### WOW upgrades — survival flash bonus (4)

I. **InstallBanner iOS modal — drop the "Sorry!"** `InstallBanner.jsx:62-64`. New copy: `On iPhone, installs happen from the Share sheet — three quick taps and you're done.` **Effort: <5min.**
J. **InstallBanner sub-text contrast on amber.** `styles.css:1757` `opacity: 0.9` on amber is borderline in outdoor sun. Bump to 0.95 or remove. **Effort: <10min.**
K. **GeoPrompt copy — drop the jargon.** `App.jsx:104`. Replace "visible to mapping apps" with "embedded into the photo file itself." **Effort: <5min.**
L. **PanelModal helper — drop "13 sheets" jargon.** `JobView.jsx:297`. Replace with: `One panel per cabinet. Photos and notes live inside.` Drop sheet count. **Effort: <5min.**

## Total estimated effort

~7.5 hours for all 17 items. Most of the cost concentrates in B (PullDialog progress, 90min), F (skeleton states, 60min), and the two DiffView surgery items (4: 30min, 5: 60min).

If aggressively triaged for a single afternoon: items 1, 2, 3, 4, 5, A, C, E, G, H, I, J, K, L total ~5 hours and cover the entire demo path with the high-leverage SharePoint moneyshot fixes. B and F are perceived-quality multipliers worth the extra hour each if time permits.

## Out of scope (parking lot for after the demo)

- `SPEC.md` drift (still claims 1.1.0; doesn't mention v32–v35).
- `manifest.webmanifest` icons use `purpose: "any maskable"` together — split into separate `any` and `maskable` entries.
- `styles.css` is 1765 lines — split by responsibility.
- ESLint warnings: `JobView.jsx:124 totalPanels` unused, `SheetForm.jsx:5 useCallback` unused, `exporter.js:15 getJob` unused, `swUpdate.js:11 React` unused.
- `SheetForm.jsx:91-104` row-delete still uses the old `exportJobJSON`/`importJSON` undo path. Follow-up: add `exportRowRaw`/`restoreRowRaw` helpers in `db.js` and switch.
- ExportDialog "Generate xlsx" button copy could be `Push to {filename}` in push mode.
- Settings storage bar shows raw numeric usage; could add a friendly interpretation.
- Toast positioning at `bottom: 110px` overlaps the FAB on iPhone SE with keyboard up.
- ChecklistView route — not exercised in demo path; check for stale microcopy.
- `JobView` AppBar crumb shows relative time (`5h ago`) — for leadership-facing screen, consider absolute date.

## Demo path 60-second wobble map (pre-fix)

| Step | Status |
|------|--------|
| 1. PWA cold open | Solid |
| 2. FAB → PullOrNewModal | Solid |
| 3. PullDialog → file picker → parse → confirm | Wobble at parse (no progress); copy tightening |
| 4. New job lands; tap into it | Wobble at build-badge debug feel; gap in skeleton state |
| 5. Tap a panel → SheetForm → fill rows | Wobble at panel-row glyph icons |
| 6. PhotoCapture | Solid |
| 7. Re-sync from xlsx → ResyncDialog → diff → apply | **Gaps** at DiffView labels + modified-row layout (this is the demo make-or-break) |
| 8. Export → ExportDialog → confirm push | Push diff lacks a directional cue |

## Handoff to next session

This spec is the artifact. The next session can:
- Read this file, review with the user, adjust scope.
- Invoke `superpowers:writing-plans` to produce a per-task implementation plan.
- Execute via `superpowers:subagent-driven-development` (matches the user's preference for multi-task plans on this repo).
