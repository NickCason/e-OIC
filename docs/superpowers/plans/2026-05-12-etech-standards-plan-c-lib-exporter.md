# Plan C — Lib + Exporter Conversion (eTech Standards Adoption)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `src/lib/*`, `src/db.js`, `src/photoOverlay.js`, `src/exporter.js`, and `src/version.js` to TypeScript with `strict: true`. Refactor `exporter.ts` and `xlsxParser.ts` to satisfy `max-depth: 2`. Switch the unit-test runner to `tsx --test` so the existing `node:test` tests run as `.ts`. Components remain `.jsx` (Plan D converts those).

**Architecture:** Define domain types in `src/types/{db,job,xlsx,sharepoint,wrapper}.ts`. Convert files in dependency order (pure utilities → IDB → photo-EXIF → xlsx parsing/diff → xlsx round-trip → photo overlay canvas → exporter). Every file conversion: rename, type, run `tsc --noEmit`, fix errors, run lint, run tests, commit.

**Tech Stack:** TypeScript 5.6 strict, `idb` (typed), `exceljs` (self-typed), `jszip` + `@types/jszip`, `tsx` for test execution, ExcelJS DOM/zip surgery patterns preserved.

**Spec:** `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`

**Branch for this plan:** `feature_1/story_3`
**Parent long-lived branch:** `feature_1/main`

---

## Prerequisites verified

- [ ] `tsconfig.json` and `tsconfig.node.json` exist with strict + tightening flags.
- [ ] `eslint.config.js` encodes eTech standards verbatim (FlatCompat + Airbnb + Airbnb-TS + jsx-a11y + react-hooks + ts-eslint).
- [ ] `tsx`, `@typescript-eslint/*`, Airbnb config packages installed.
- [ ] `src/types/piexifjs.d.ts` present.
- [ ] `src/types/placeholder.ts` exists (this plan deletes it).
- [ ] CI workflow has `typecheck` step in `lint-and-typecheck` job.
- [ ] Plan B merge SHA recorded: `<filled in by Plan B handoff>`.
- [ ] Spec reviewed: `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`.
- [ ] Memory `project_eoic_etech_migration.md` shows Plans A and B complete.

---

## Plan chain

- **Previous (B):** TS scaffolding + tooling — `docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md` (must be complete).
- **This plan (C):** Lib + exporter conversion.
- **Next (D):** Components + scripts + final release — `docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md`.

---

## Working rule: per-file conversion loop

For every file conversion in this plan, use this loop. Plan tasks below refer to it as "the conversion loop".

1. `git mv path/to/file.js path/to/file.ts` (or `.jsx` → `.tsx`).
2. Edit the renamed file: add type annotations on every exported symbol, function parameter, and return type. Use the domain types from `src/types/`. Use `IPascalCase` for interfaces (component prop shapes and structural object types); use `PascalCase` (no `I`) for type aliases (unions, primitives, function types).
3. Adjust import statements: drop file extensions (`import x from './foo'` not `'./foo.js'`).
4. Run `npm run typecheck`. Fix each error by narrowing types — do NOT add `any` to silence errors. If genuinely untyped 3rd-party surface, write a narrow declaration in `src/types/`.
5. Run `npm run lint`. Fix violations.
6. Run `npm run test:unit && npm run test:e2e` (skip test:e2e until the e2e script itself is updated to handle TS imports). If a test imports the converted file, the test still runs (Vite/import resolution handles the `.ts` extension via tsconfig). If anything fails, debug.
7. Commit:
   ```
   git add <changed paths>
   git commit -m "refactor(ts): convert <file path> to TypeScript"
   ```

When refactoring for `max-depth: 2`, commit the refactor as its own commit BEFORE the rename, so the diff is reviewable:
```
git commit -m "refactor: extract <helper-name> in <file> (prep for max-depth: 2 rule)"
```

---

## Task 1: Branch setup + remove placeholder

**Files:**
- Delete: `src/types/placeholder.ts`
- No other file changes; git operations.

- [ ] **Step 1: Update local feature_1/main**

```bash
git checkout feature_1/main
git pull --ff-only origin feature_1/main
```

- [ ] **Step 2: Create story_3 branch**

```bash
git checkout -b feature_1/story_3
git push -u origin feature_1/story_3
```

- [ ] **Step 3: Keep the placeholder for now**

Don't delete `src/types/placeholder.ts` yet — Task 2 creates real type files; the placeholder is removed at the end of Task 2 to keep `tsc` happy during the in-between state.

---

## Task 2: Define domain types in src/types/

**Files:**
- Create: `src/types/db.ts`
- Create: `src/types/job.ts`
- Create: `src/types/xlsx.ts`
- Create: `src/types/sharepoint.ts`
- Create: `src/types/wrapper.ts`
- Delete: `src/types/placeholder.ts`

- [ ] **Step 1: Inspect existing data shapes**

Run, in this order, to gather the schema:
```bash
cat src/db.js | sed -n '1,120p'
cat src/lib/seed.js
grep -n "job\." src/lib/jobDiff.js | head -40
grep -n "panel\." src/lib/jobDiff.js | head -40
grep -n "row\." src/lib/jobDiff.js | head -40
cat src/lib/wrapperBridge.js
```

Note every property accessed on `job`, `panel`, `row`, `photo`, including optional fields (anything used inside `if (x.foo)` or `x.foo ?? default`).

- [ ] **Step 2: Write `src/types/job.ts`**

```ts
export interface IJob {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    source?: IJobSource
}

export interface IJobSource {
    kind: 'xlsx'
    filename: string
    pulledAt: number
}

export interface IPanel {
    id: string
    jobId: string
    name: string
    sheetType: string
    createdAt: number
    updatedAt: number
}

export interface IRow {
    id: string
    panelId: string
    sheetType: string
    values: Record<string, string | number | boolean | null>
    notes?: string
    createdAt: number
    updatedAt: number
}

export interface IPhoto {
    id: string
    jobId: string
    panelId: string
    rowId: string | null
    blob: Blob
    gps?: IPhotoGps
    capturedAt: number
    createdAt: number
}

export interface IPhotoGps {
    lat: number
    lng: number
    alt?: number
}

export type RowValue = string | number | boolean | null
```

Extend the above only to match what existing JS actually uses. If a property name in JS differs from what's above, change the type — do NOT change the JS to match the type. The type follows the code.

- [ ] **Step 3: Write `src/types/db.ts`**

```ts
import type { DBSchema } from 'idb'
import type { IJob, IPanel, IRow, IPhoto } from './job'

export interface IEoicDBSchema extends DBSchema {
    jobs: {
        key: string
        value: IJob
        indexes: { 'by-updatedAt': number }
    }
    panels: {
        key: string
        value: IPanel
        indexes: { 'by-jobId': string }
    }
    rows: {
        key: string
        value: IRow
        indexes: { 'by-panelId': string }
    }
    photos: {
        key: string
        value: IPhoto
        indexes: {
            'by-jobId': string
            'by-panelId': string
            'by-rowId': string
        }
    }
}

export const DB_NAME = 'eoic'
export const DB_VERSION = 4
```

Verify against current `db.js` — adjust store names, key paths, and index names so they match the actual `openDB(...)` call. The type follows the code.

- [ ] **Step 4: Write `src/types/xlsx.ts`**

```ts
import type { IJob, IPanel, IRow } from './job'

export interface IParsedXlsx {
    jobMeta: IParsedJobMeta
    panels: IParsedPanel[]
    rows: IParsedRow[]
    notesByPanel: Record<string, string>
    notesByRow: Record<string, string>
    notesJob: string
    warnings: IXlsxParserWarning[]
}

export interface IParsedJobMeta {
    name: string
}

export interface IParsedPanel {
    name: string
    sheetType: string
}

export interface IParsedRow {
    panelName: string
    label: string
    sheetType: string
    values: Record<string, string | number | boolean | null>
}

export type XlsxParserWarningKind =
    | 'extra-column'
    | 'missing-column'
    | 'unknown-sheet'
    | 'missing-sheet'
    | 'unknown-panel-reference'
    | 'notes-row-unmatched'

export interface IXlsxParserWarning {
    kind: XlsxParserWarningKind
    sheet?: string
    column?: string
    row?: number
    message: string
}

export interface IJobDiff {
    panels: IPanelDiff[]
    rows: IRowDiff[]
    valuesChanged: number
}

export interface IPanelDiff {
    name: string
    op: 'add' | 'remove' | 'keep'
}

export interface IRowDiff {
    panelName: string
    label: string
    op: 'add' | 'remove' | 'change' | 'keep'
    changedFields?: string[]
}

export interface IResyncDecisions {
    keepRemovedPanels: string[]
    keepRemovedRows: Array<{ panelName: string; label: string }>
}
```

- [ ] **Step 5: Write `src/types/sharepoint.ts`**

```ts
import type { IParsedXlsx, IJobDiff, IResyncDecisions } from './xlsx'

export interface IPullDialogInput {
    parsed: IParsedXlsx
    sourceFilename: string
}

export interface IResyncDialogInput {
    jobId: string
    parsed: IParsedXlsx
    diff: IJobDiff
    decisions: IResyncDecisions
}
```

- [ ] **Step 6: Write `src/types/wrapper.ts`**

```ts
export type WrapperInboundMessage =
    | { type: 'wrapper:hello'; version: string }
    | { type: 'wrapper:back-button' }
    | { type: 'wrapper:share-target'; payload: IWrapperSharePayload }

export type WrapperOutboundMessage =
    | { type: 'app:ready' }
    | { type: 'app:request-camera' }
    | { type: 'app:export-saved'; filename: string }

export interface IWrapperSharePayload {
    mimeType: string
    filename: string
    dataUrl: string
}

export function assertNever(x: never): never {
    throw new Error(`Unhandled discriminated union variant: ${JSON.stringify(x)}`)
}
```

- [ ] **Step 7: Delete the placeholder**

```bash
rm src/types/placeholder.ts
```

- [ ] **Step 8: Run typecheck**

```bash
npm run typecheck
```
Expected: exit 0 (no errors — the new type files have no implementation that could fail; placeholder removal is safe because real type files exist).

- [ ] **Step 9: Commit**

```bash
git add src/types/ -A
git commit -m "feat(types): domain types for db, job, xlsx, sharepoint, wrapper

Removes the Plan B placeholder. Types follow the code (extracted by
reading current JS); do not retro-fit code to types in this commit."
```

---

## Task 3: Convert pure utility lib files (no IDB, no canvas, no parsing)

**Files (in this order):**
- `src/lib/paths.js` → `paths.ts` (test: `paths.test.js` → `paths.test.ts`)
- `src/lib/fieldHints.js` → `fieldHints.ts`
- `src/lib/rowLabel.js` → `rowLabel.ts`
- `src/lib/loadingPhrases.js` → `loadingPhrases.ts`
- `src/lib/theme.js` → `theme.ts`
- `src/lib/toast.js` → `toast.ts`
- `src/lib/loaderHold.js` → `loaderHold.ts`
- `src/lib/swUpdate.js` → `swUpdate.ts`
- `src/lib/metrics.js` → `metrics.ts`
- `src/lib/geolocation.js` → `geolocation.ts`
- `src/lib/useKeyboardInset.js` → `useKeyboardInset.ts`
- `src/lib/usePwaInstall.js` → `usePwaInstall.ts`
- `src/lib/wrapperBridge.js` → `wrapperBridge.ts` (test: `wrapperBridge.test.js` → `wrapperBridge.test.ts`)
- `src/version.js` → `src/version.ts`

For each file, run the conversion loop (see "Working rule" above). Commit per file (or per file + its test, if a test exists for the same file).

- [ ] **Step 1: paths.ts + paths.test.ts**

Run the conversion loop on `src/lib/paths.js` and `src/lib/paths.test.js` together. Commit:
```
git commit -m "refactor(ts): convert paths + paths.test to TypeScript"
```

- [ ] **Step 2: fieldHints.ts**

Run the conversion loop on `src/lib/fieldHints.js`. Commit.

- [ ] **Step 3: rowLabel.ts**

Run the conversion loop. The `SHEET_LABEL_CONFIG` constant should be typed with a precise shape, not `Record<string, any>`. Commit.

- [ ] **Step 4: loadingPhrases.ts**

Run the conversion loop. Commit.

- [ ] **Step 5: theme.ts**

Run the conversion loop. Theme tokens should be a `const` object typed `as const` so the union of token names is inferable. Commit.

- [ ] **Step 6: toast.ts**

Run the conversion loop. The toast queue API gets explicit `IToastMessage` interface (no `I` prefix on type aliases, `I` prefix on the interface). Commit.

- [ ] **Step 7: loaderHold.ts**

Run the conversion loop. Commit.

- [ ] **Step 8: swUpdate.ts**

Run the conversion loop. Service-worker `Registration` types come from the standard DOM lib (`ServiceWorkerRegistration`). Commit.

- [ ] **Step 9: metrics.ts**

Run the conversion loop. Commit.

- [ ] **Step 10: geolocation.ts**

Run the conversion loop. `GeolocationPosition` and `GeolocationPositionError` are standard DOM types. Commit.

- [ ] **Step 11: useKeyboardInset.ts**

Run the conversion loop. The hook signature should make its return type explicit (likely `void`). `visualViewport` is on `window.visualViewport` with type `VisualViewport | null`. Commit.

- [ ] **Step 12: usePwaInstall.ts**

Run the conversion loop. The `beforeinstallprompt` event has no standard DOM type — declare a `BeforeInstallPromptEvent` interface locally (or in `src/types/dom-augment.ts`) extending `Event` with `prompt(): Promise<void>` and `userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>`. Commit.

- [ ] **Step 13: wrapperBridge.ts + wrapperBridge.test.ts**

Run the conversion loop. Use the `WrapperInboundMessage`/`WrapperOutboundMessage` discriminated unions from `src/types/wrapper.ts` and the `assertNever` helper for exhaustiveness checks. Commit.

- [ ] **Step 14: src/version.ts**

Run the conversion loop. (This file is one line — typed as `export const BUILD_VERSION: string = __BUILD_VERSION__;`. Note `__BUILD_VERSION__` is injected by Vite; declare it once in `src/types/dom-augment.ts` or use the existing ESLint allowlist plus a `declare const __BUILD_VERSION__: string` at module scope.) Commit.

- [ ] **Step 15: Suite check after this task**

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
```
All four exit 0. Investigate any failure before proceeding to Task 4.

---

## Task 4: Convert db.ts + seed.ts

**Files:**
- `src/db.js` → `src/db.ts`
- `src/lib/seed.js` → `src/lib/seed.ts`
- `src/lib/rawSnapshot.test.js` → `src/lib/rawSnapshot.test.ts`

- [ ] **Step 1: Run the conversion loop on `src/db.js`**

Key typing decisions:
- Use `openDB<IEoicDBSchema>(DB_NAME, DB_VERSION, { upgrade })` from `idb` (type imported from `src/types/db.ts`).
- The `upgrade(db, oldVersion, newVersion, tx)` callback gets full type narrowing from `IEoicDBSchema`.
- Exported `exportPanelRaw`, `restorePanelRaw`, `exportJobRaw`, `restoreJobRaw` functions accept/return `Blob` references with explicit IDs; type their inputs as `{ jobId: string }` or `{ panelId: string }` etc.
- All cursor iterations should use the typed `index.openCursor()` form.
- Watch for `noUncheckedIndexedAccess` on `tx.objectStoreNames` and `getAll()` results — narrow before use.

If the `db.ts` body exceeds `max-depth: 2`, extract per-store handlers as helpers (e.g., `upgradeFromV3ToV4(db, tx)`).

Commit:
```
git commit -m "refactor(ts): convert db to TypeScript with idb DBSchema typing"
```

- [ ] **Step 2: Run the conversion loop on `src/lib/seed.js`**

Use the `IJob`/`IPanel`/`IRow` types. Commit.

- [ ] **Step 3: Run the conversion loop on `src/lib/rawSnapshot.test.js`**

The test imports raw-snapshot helpers from `db.ts`. Now-typed signatures may force test-side narrowing. Commit.

- [ ] **Step 4: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```
All four exit 0.

---

## Task 5: Convert photoExif.ts + photoStore.ts

**Files:**
- `src/lib/photoExif.js` → `src/lib/photoExif.ts`
- `src/lib/photoExif.test.js` → `src/lib/photoExif.test.ts`
- `src/lib/photoStore.js` → `src/lib/photoStore.ts`

- [ ] **Step 1: Run conversion loop on `photoExif.ts` + `photoExif.test.ts`**

Use the `IExifData` and `IGPSIFD` types from `src/types/piexifjs.d.ts`. Return type of `readPhotoExif(file: File): Promise<{ gps?: IPhotoGps; capturedAt?: number }>`. Commit.

- [ ] **Step 2: Run conversion loop on `photoStore.ts`**

`processIncomingPhoto(file: File, options: { gps?: IPhotoGps }): Promise<Blob>`. Commit.

- [ ] **Step 3: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

---

## Task 6: Convert xlsxParser with max-depth: 2 refactor

**Files:**
- Refactor first (still .js): `src/lib/xlsxParser.js` — extract helpers to satisfy `max-depth: 2`
- Rename: `src/lib/xlsxParser.js` → `src/lib/xlsxParser.ts`
- Test: `src/lib/xlsxParser.test.js` → `src/lib/xlsxParser.test.ts`

- [ ] **Step 1: Inspect current nesting**

Run: `npx eslint src/lib/xlsxParser.js --rule '{"max-depth":["error",2]}' --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module 2>&1 | head -40`

This reveals every block that violates `max-depth: 2`. For each, identify a helper extraction target.

- [ ] **Step 2: Extract helpers, one commit per logical group**

Typical extractions:
- `parseSheet(workbook, sheetName, schemaMap): IParsedSheetResult` — handles one sheet end-to-end.
- `parseRow(row, columnMap, sheetType): IParsedRow | null` — handles one row.
- `parseCell(cell, column): RowValue` — handles one cell, including numeric-string coercion.
- `extractNotesAppendix(worksheet): { byPanel, byRow, byJob }` — pulls the Notes block.
- `recordWarning(warnings, warning): void` — appends + tags source location.

After each extraction:
```bash
node --test src/lib/xlsxParser.test.js  # must still pass
git add src/lib/xlsxParser.js
git commit -m "refactor: extract <helper> in xlsxParser (prep for max-depth: 2)"
```

- [ ] **Step 3: Re-run eslint check**

```bash
npx eslint src/lib/xlsxParser.js --rule '{"max-depth":["error",2]}' --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module
```
Expected: zero violations.

- [ ] **Step 4: Run conversion loop on `xlsxParser.js` → `xlsxParser.ts`**

Use `IParsedXlsx`, `IXlsxParserWarning`, `IParsedRow`, etc. from `src/types/xlsx.ts`. ExcelJS types from `exceljs` itself. Narrow `Workbook.getWorksheet(name)` return (it's `Worksheet | undefined`).

Commit:
```
git commit -m "refactor(ts): convert xlsxParser to TypeScript"
```

- [ ] **Step 5: Run conversion loop on `xlsxParser.test.ts`**

Commit.

- [ ] **Step 6: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

---

## Task 7: Convert jobDiff + xlsxRoundTrip

**Files:**
- `src/lib/jobDiff.js` → `src/lib/jobDiff.ts`
- `src/lib/jobDiff.test.js` → `src/lib/jobDiff.test.ts`
- `src/lib/xlsxRoundTrip.js` → `src/lib/xlsxRoundTrip.ts`

- [ ] **Step 1: Check max-depth on jobDiff**

```bash
npx eslint src/lib/jobDiff.js --rule '{"max-depth":["error",2]}' --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module
```

If violations: extract helpers (likely `matchRows`, `compareValues`, `buildPanelDiff`). Commit each extraction.

- [ ] **Step 2: Convert jobDiff.ts + jobDiff.test.ts**

Use `IJobDiff`, `IPanelDiff`, `IRowDiff` from `src/types/xlsx.ts`. The `valuesEqual` numeric-cross-type behavior must be preserved exactly (the e2e test verifies). Commit.

- [ ] **Step 3: Convert xlsxRoundTrip.ts**

Use `IResyncDecisions`, IDB transaction types from `IEoicDBSchema`. Both `applyParsedXlsxToNewJob` and `applyResyncToJob` are atomic via `idb` transactions — types from `idb` cover this. Commit.

- [ ] **Step 4: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

---

## Task 8: Convert photoOverlay.ts (canvas-heavy)

**Files:**
- `src/photoOverlay.js` → `src/photoOverlay.ts`

- [ ] **Step 1: Inspect current nesting**

```bash
npx eslint src/photoOverlay.js --rule '{"max-depth":["error",2]}' --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module
```

If violations: extract `drawHeaderLine`, `drawFooterLine`, `composeOverlayCanvas` style helpers. Commit each.

- [ ] **Step 2: Run the conversion loop**

`CanvasRenderingContext2D`, `HTMLCanvasElement`, `HTMLImageElement` are standard DOM types. `applyOverlay(blob: Blob, lines: string[], gps?: IPhotoGps): Promise<Blob>`. `drawOverlay(ctx: CanvasRenderingContext2D, ...): void`.

Commit.

- [ ] **Step 3: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

---

## Task 9: Convert exporter.ts (max-depth: 2 refactor — biggest single task)

**Files:**
- Refactor first (still .js): `src/exporter.js` — extract helpers to satisfy `max-depth: 2`. The `fixZip` block is the main target.
- Rename: `src/exporter.js` → `src/exporter.ts`

- [ ] **Step 1: Inspect current nesting**

```bash
npx eslint src/exporter.js --rule '{"max-depth":["error",2]}' --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module
```

Expect many violations clustered in `fixZip`.

- [ ] **Step 2: Extract per-fix-up helpers, one commit per extraction**

Each helper takes the relevant zip/DOM slice and returns the transformed result. Typical extractions:
- `stripFeaturePropertyBag(xmlString: string): string`
- `reorderTableParts(sheetXml: string): string`
- `repairAutoFilter(sheetXml: string): string`
- `replicateExampleRowStyles(sheetXml: string, rowCount: number): string`
- `rewriteCellXfRefs(sheetXml: string, cellXfMap: Record<number, number>): string`
- `fixDpiSentinels(buffer: Uint8Array): Uint8Array`
- `extendTableRef(sheetXml: string, lastRow: number): string`

After each helper extraction:
```bash
npm run test:e2e  # e2e exporter round-trip must still pass
git add src/exporter.js
git commit -m "refactor: extract <helper> in exporter (prep for max-depth: 2)"
```

- [ ] **Step 3: Re-run eslint check**

```bash
npx eslint src/exporter.js --rule '{"max-depth":["error",2]}' --no-eslintrc --parser-options=ecmaVersion:latest,sourceType:module
```
Expected: zero violations.

If a specific block genuinely cannot be split without harming readability of the xlsx surgery (rare), add a narrow disable:
```js
// eslint-disable-next-line max-depth -- xlsx <specific-surgery>: splitting harms readability, see fixZip note above
```
and document the WHY in this plan's PR description.

- [ ] **Step 4: Run the conversion loop on exporter.ts**

Key typings:
- `exportJob(jobId: string, mode: 'zip' | 'xlsx-only'): Promise<Blob>`
- ExcelJS types from `exceljs`; JSZip types from `@types/jszip`.
- The exporter imports from `db.ts`, `photoOverlay.ts`, `rowLabel.ts`, `paths.ts` — those are typed already.
- The `fixZip` IIFE/function takes a `JSZip` instance and returns a `JSZip` instance.

Commit:
```
git commit -m "refactor(ts): convert exporter to TypeScript"
```

- [ ] **Step 5: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e
```

The e2e test produces a sample export — verify the `sample-export` artifact still opens in Excel (open `/tmp/eoic-e2e/*.xlsx` on the Mac as part of hands-on QA in Task 11).

---

## Task 10: Switch unit-test runner to tsx --test

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update the `test:unit` script**

In `package.json` `scripts` block, change:
```json
"test:unit": "node --test src/lib/*.test.js"
```
to:
```json
"test:unit": "tsx --test 'src/lib/*.test.ts'"
```

Note: `tsx --test` requires `tsx` ≥ 4.7. Confirm with `npx tsx --version` (installed in Plan B).

- [ ] **Step 2: Run unit tests**

```bash
npm run test:unit
```
Expected: all 36+ tests green (xlsxParser, jobDiff, photoExif, rawSnapshot, paths, wrapperBridge).

If failures: most likely an import-extension issue (`'./foo.js'` vs `'./foo'`) or a TS-strict narrowing issue in the test file itself. Fix in this commit.

- [ ] **Step 3: Update CI workflow**

The CI `unit-test` job already runs `npm run test:unit` — no workflow change needed, but verify by checking `.github/workflows/deploy.yml`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "ci(test): switch unit runner to tsx --test for TS test files

Unit tests in src/lib/*.test.ts now run via tsx (still using node:test
under the hood). No assertion changes."
```

---

## Task 11: Verification

**Files:**
- No file changes.

- [ ] **Step 1: Full automated suite**

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```
Expected: all six exit 0. Lint must report zero errors AND zero warnings (CI runs `--max-warnings 0`).

- [ ] **Step 2: Verify the exporter produces a valid xlsx**

```bash
ls -la /tmp/eoic-e2e/
```
Open the latest `.xlsx` in Excel on the Mac. Manually verify:
- Every sheet present.
- Cell checkboxes render natively (no glyph fallback).
- Table refs cover all data rows.
- AutoFilter applies cleanly.
- Notes appendix present and aligned with rows.

- [ ] **Step 3: Tailscale preview hands-on walkthrough**

```bash
npm run build
npm run preview -- --host &
PREVIEW_PID=$!
sleep 3
tailscale serve --bg https+insecure://localhost:4173
tailscale serve status
```

Post the resulting Tailscale URL.

Hands-on items (agent runs from Mac; user re-tests from real device):
- Create job from sample seed. Add a panel. Add several rows.
- Capture a photo via camera path (overlay metadata correct).
- Capture a photo via library path (EXIF GPS recovered).
- Open lightbox; navigate photos.
- Export xlsx (zip mode). Open in Excel; verify overlay-baked photos and cell checkboxes.
- Export xlsx (xlsx-only mode). Verify the bare file.
- Pull a job from an existing xlsx; verify diff view; create new job.
- Re-sync an unchanged xlsx into an existing job; verify zero diffs.
- Re-sync a modified xlsx; verify changes show with keep/drop pills.
- Reload the page; data persists.

Stop preview after handoff:
```bash
kill $PREVIEW_PID
tailscale serve reset
```

- [ ] **Step 4: Push branch + open PR**

```bash
git push origin feature_1/story_3
gh pr create --base feature_1/main --head feature_1/story_3 \
  --title "feature_1/story_3: lib + exporter → TypeScript strict" \
  --body "$(cat <<'EOF'
## Summary
- Domain types in src/types/{db,job,xlsx,sharepoint,wrapper}.ts + piexifjs.d.ts
- All src/lib/* converted to .ts (with tests)
- src/db.ts (typed via idb DBSchema)
- src/photoOverlay.ts, src/exporter.ts
- max-depth: 2 refactors in xlsxParser, jobDiff (where needed), exporter
- Unit test runner: tsx --test
- Components remain .jsx — Plan D converts those

## Related
- Feature 1 / Story 3
- Spec: docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md

## Test plan
- [ ] All five CI jobs green
- [ ] e2e exporter round-trip green
- [ ] Tailscale preview walkthrough green
EOF
)"
```

Wait for all five CI jobs green.

- [ ] **Step 5: Produce confidence rating**

```
Confidence: NN%
Automated: lint ✅ | tsc ✅ | unit (n/n) ✅ | e2e ✅ | build ✅
Hands-on:
- Sample xlsx opens in Excel; checkboxes native, tables/autofilter clean.
- Photo capture both source modes correct.
- xlsx export both modes correct.
- SharePoint pull-as-new + resync (zero-diff and with-changes) correct.
- IDB persistence intact.
Known gaps/risks: <list or "none">
Tailscale URL: https://...
```

If < 95%, fix and re-test.

- [ ] **Step 6: Merge into feature_1/main**

```bash
gh pr merge $(gh pr view --json number -q .number) --merge --delete-branch=false
git checkout feature_1/main && git pull --ff-only origin feature_1/main
```

---

## Task 12: Save memory + update downstream plan files

This is the **last step of Plan C**. Run before declaring done so the user can `/clear` context before Plan D.

**Files:**
- Modify: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic_etech_migration.md`
- Modify: `docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md`

- [ ] **Step 1: Capture merge SHA**

```bash
PLAN_C_MERGE_SHA=$(git rev-parse feature_1/main)
echo "Plan C merge SHA: $PLAN_C_MERGE_SHA"
```

- [ ] **Step 2: Update migration-status memory**

Edit `project_eoic_etech_migration.md`:
- Mark Plan C `[x]` with merge SHA + date.
- Add under "Decisions locked in":
  - `tsx --test` is the unit runner for TS test files.
  - Domain types live in `src/types/`; component-specific interface types in Plan D's converted components.
  - Any narrow `eslint-disable max-depth` instances applied: <list with file + reason, or "none">.

Update the MEMORY.md index entry's trailing hook: "Plan C done; Plan D next (components + scripts)".

- [ ] **Step 3: Update Plan D's "Prerequisites verified" section**

Open `docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md`. Mark prerequisites:
- [x] All `src/lib/*` converted to `.ts` with strict typing.
- [x] `src/db.ts`, `src/photoOverlay.ts`, `src/exporter.ts`, `src/version.ts` converted.
- [x] Domain types present: `src/types/{db,job,xlsx,sharepoint,wrapper}.ts`, `src/types/piexifjs.d.ts`.
- [x] Unit-test runner is `tsx --test`.
- [x] `max-depth: 2` refactors complete in lib/exporter (with any disables documented in PR).
- [x] Plan C merge SHA recorded: `<PLAN_C_MERGE_SHA>`.

- [ ] **Step 4: Commit the Plan D update on a tiny handoff branch**

```bash
git checkout feature_1/main && git pull --ff-only origin feature_1/main
git checkout -b feature_1/story_3-handoff
git add docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md
git commit -m "chore(plan-handoff): mark Plan C prerequisites complete in Plan D"
git push -u origin feature_1/story_3-handoff
gh pr create --base feature_1/main --head feature_1/story_3-handoff \
  --title "Plan C → Plan D handoff" \
  --body "Records Plan C merge SHA in Plan D prerequisites."
gh pr merge --merge --delete-branch
git checkout feature_1/main && git pull --ff-only origin feature_1/main
```

- [ ] **Step 5: Final handoff message**

```
✅ Plan C complete.

Confidence: NN%
Plan C merge SHA: <PLAN_C_MERGE_SHA>
Converted: all of src/lib/*, src/db, src/photoOverlay, src/exporter, src/version
Unit runner: tsx --test
max-depth: 2 refactors complete

Memory updated: project_eoic_etech_migration.md
Next plan: docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md

Safe to /clear context. Plan D subagent should branch feature_1/story_4 from feature_1/main.
```

---

## Self-Review Checklist

- [ ] Every file rename is documented as a discrete step with the conversion loop applied.
- [ ] No "TODO" / "TBD" / placeholder language.
- [ ] Domain type interfaces use `I` prefix (per standards `@typescript-eslint/naming-convention`).
- [ ] Type aliases (unions, primitives) do NOT use `I` prefix.
- [ ] `max-depth: 2` refactors are committed BEFORE the rename for reviewability.
- [ ] Unit-test runner switched to `tsx --test`.
- [ ] Task 12 saves memory and updates Plan D's prerequisites section.
- [ ] Hands-on QA covers exporter round-trip end-to-end (the riskiest area).
