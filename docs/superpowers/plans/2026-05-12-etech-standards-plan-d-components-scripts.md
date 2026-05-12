# Plan D — Components + Scripts + Final Release (eTech Standards Adoption)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all React components (`src/components/*.jsx`, `src/App.jsx`, `src/main.jsx`) to TypeScript with strict typing. Convert build scripts (`scripts/*.mjs` → `*.mts`) and `vite.config.js` → `vite.config.ts`. Remove the JS-transition ESLint block so no `.js`/`.jsx` files remain. Merge `feature_1/main` into `develop` and cut the first TS release branch `releases/v<next-minor>.0`.

**Architecture:** Convert components in dependency order: leaf components first (presentational, no children), then containers, then `App.tsx`, then `main.tsx`. Each component's props interface follows the `IProps` naming convention. Function-component definitions use the arrow-function form per `react/function-component-definition` rule. Scripts use `.mts` and run via `tsx`.

**Tech Stack:** React 18 + `@types/react` 18, TypeScript 5.6 strict, `tsx` for `.mts` execution.

**Spec:** `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`

**Branch for this plan:** `feature_1/story_4`
**Parent long-lived branch:** `feature_1/main`

---

## Prerequisites verified

- [ ] All `src/lib/*` converted to `.ts` with strict typing.
- [ ] `src/db.ts`, `src/photoOverlay.ts`, `src/exporter.ts`, `src/version.ts` converted.
- [ ] Domain types present: `src/types/{db,job,xlsx,sharepoint,wrapper}.ts`, `src/types/piexifjs.d.ts`.
- [ ] Unit-test runner is `tsx --test`.
- [ ] `max-depth: 2` refactors complete in lib/exporter (any disables documented).
- [ ] Plan C merge SHA recorded: `<filled in by Plan C handoff>`.
- [ ] Spec reviewed: `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`.
- [ ] Memory `project_eoic_etech_migration.md` shows Plans A, B, C complete.

---

## Plan chain

- **Previous (C):** Lib + exporter conversion — `docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md` (must be complete).
- **This plan (D):** Components + scripts + final release. **Terminal plan.**

---

## Working rule: per-component conversion loop

For every `.jsx` → `.tsx` conversion:

1. `git mv path/to/Component.jsx path/to/Component.tsx`.
2. Add `IComponentNameProps` interface in the file (above the component). Required props are non-optional; optional props use `?:`.
3. Convert the component definition to the arrow-function form per the standards rule:
   ```tsx
   const ComponentName: React.FC<IComponentNameProps> = ({ propA, propB }) => { ... }
   ```
   Or, per Airbnb's preference and the standards' explicit rule, use the non-`React.FC` arrow form:
   ```tsx
   const ComponentName = ({ propA, propB }: IComponentNameProps) => { ... }
   ```
   Choose one form and apply consistently across all components in this plan. **Decision: use the non-`React.FC` arrow form** — it matches `react/function-component-definition: ["error", { namedComponents: "arrow-function" }]` without dragging `React.FC`'s quirks.
4. Type every `useState`, `useRef`, `useEffect` cleanup, event handler. Event handlers use the standard React event types (`React.ChangeEvent<HTMLInputElement>`, `React.MouseEvent<HTMLButtonElement>`, etc.).
5. Drop `.js`/`.jsx` extensions from imports.
6. Run `npm run typecheck`, `npm run lint`. Fix all errors and warnings.
7. Run the app via `npm run dev` and spot-check the component renders. (Full hands-on QA is in Task 8.)
8. Commit per file (or per related cluster):
   ```
   git commit -m "refactor(ts): convert <Component> to TypeScript"
   ```

When a component currently uses `function Foo()` syntax, the conversion includes flipping it to arrow-function form. This may require adjusting how it's hoisted or referenced.

---

## Task 1: Branch setup

**Files:**
- No file changes.

- [ ] **Step 1: Update local feature_1/main**

```bash
git checkout feature_1/main
git pull --ff-only origin feature_1/main
```

- [ ] **Step 2: Create story_4 branch**

```bash
git checkout -b feature_1/story_4
git push -u origin feature_1/story_4
```

---

## Task 2: Convert leaf / presentational components

These have no child component dependencies (or only DOM primitives).

**Files (one commit per file, or grouped where tight):**
- `src/components/Icon.jsx`
- `src/components/PercentBar.jsx`
- `src/components/PercentRing.jsx`
- `src/components/CountUp.jsx`
- `src/components/Marquee.jsx`
- `src/components/EtechLoader.jsx`
- `src/components/LoadingPhrases.jsx`
- `src/components/EmptyState.jsx`
- `src/components/ToastHost.jsx`
- `src/components/UpdatePill.jsx`
- `src/components/SaveBar.jsx`
- `src/components/AppBar.jsx`
- `src/components/InstallBanner.jsx`
- `src/components/WrapperUpdateBanner.jsx`

For each, run the per-component conversion loop above. Commit per file.

- [ ] **Step 1: Icon.tsx** — Run conversion loop. Commit.
- [ ] **Step 2: PercentBar.tsx** — Run conversion loop. Commit.
- [ ] **Step 3: PercentRing.tsx** — Run conversion loop. Commit.
- [ ] **Step 4: CountUp.tsx** — Run conversion loop. Commit.
- [ ] **Step 5: Marquee.tsx** — Run conversion loop. Commit.
- [ ] **Step 6: EtechLoader.tsx** — Run conversion loop. Commit.
- [ ] **Step 7: LoadingPhrases.tsx** — Run conversion loop. Commit.
- [ ] **Step 8: EmptyState.tsx** — Run conversion loop. Commit.
- [ ] **Step 9: ToastHost.tsx** — Run conversion loop. Commit.
- [ ] **Step 10: UpdatePill.tsx** — Run conversion loop. Commit.
- [ ] **Step 11: SaveBar.tsx** — Run conversion loop. Commit.
- [ ] **Step 12: AppBar.tsx** — Run conversion loop. Commit.
- [ ] **Step 13: InstallBanner.tsx** — Run conversion loop. Commit. Note: uses the `BeforeInstallPromptEvent` type declared in Plan C's `usePwaInstall.ts`.
- [ ] **Step 14: WrapperUpdateBanner.tsx** — Run conversion loop. Commit.

- [ ] **Step 15: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e && npm run build
```
All five exit 0.

---

## Task 3: Convert form / list / detail components

These compose leaf components and consume lib modules.

**Files:**
- `src/components/SheetForm.jsx`
- `src/components/SheetPicker.jsx`
- `src/components/Lightbox.jsx`
- `src/components/PhotoOverlay.jsx`
- `src/components/PhotoChecklist.jsx`
- `src/components/PhotoCapture.jsx`
- `src/components/RowPhotos.jsx`
- `src/components/DiffView.jsx`
- `src/components/ExportDialog.jsx`
- `src/components/PullDialog.jsx`
- `src/components/PullOrNewModal.jsx`
- `src/components/ResyncDialog.jsx`
- `src/components/ChecklistTaskRow.jsx`
- `src/components/ChecklistView.jsx`
- `src/components/SettingsView.jsx`

For each, run the conversion loop. Some notes:

- [ ] **Step 1: SheetForm.tsx** — Form-cell components. Use `IRow`/`RowValue` from `src/types/job.ts`. Form change handlers use `React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>`. Commit.
- [ ] **Step 2: SheetPicker.tsx** — Commit.
- [ ] **Step 3: Lightbox.tsx** — Use `IPhoto`. Keyboard navigation handlers (`KeyboardEvent`). Commit.
- [ ] **Step 4: PhotoOverlay.tsx** — Live-overlay CSS layer component. Props: photo metadata strings. Commit.
- [ ] **Step 5: PhotoChecklist.tsx** — Commit.
- [ ] **Step 6: PhotoCapture.tsx** — File input handler typing (`React.ChangeEvent<HTMLInputElement>`, `File`). The `handleFiles(fileList, source)` function: `source: 'camera' | 'library'`. Commit.
- [ ] **Step 7: RowPhotos.tsx** — Commit.
- [ ] **Step 8: DiffView.tsx** — Use `IJobDiff`, `IRowDiff` from `src/types/xlsx.ts`. Commit.
- [ ] **Step 9: ExportDialog.tsx** — Mode toggle: `'zip' | 'xlsx-only'`. Commit.
- [ ] **Step 10: PullDialog.tsx** — Use `IPullDialogInput` from `src/types/sharepoint.ts`. Commit.
- [ ] **Step 11: PullOrNewModal.tsx** — Commit.
- [ ] **Step 12: ResyncDialog.tsx** — Use `IResyncDialogInput` from `src/types/sharepoint.ts`. Commit.
- [ ] **Step 13: ChecklistTaskRow.tsx** — Commit.
- [ ] **Step 14: ChecklistView.tsx** — Commit.
- [ ] **Step 15: SettingsView.tsx** — Commit.

- [ ] **Step 16: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e && npm run build
```

---

## Task 4: Convert top-level containers + entry points

**Files:**
- `src/components/JobList.jsx` → `JobList.tsx`
- `src/components/JobView.jsx` → `JobView.tsx`
- `src/components/PanelView.jsx` → `PanelView.tsx`
- `src/App.jsx` → `src/App.tsx`
- `src/main.jsx` → `src/main.tsx`

- [ ] **Step 1: JobList.tsx** — Container. Uses `IJob`. The per-row IDB fetch fan-out (Promise.all from v35) types as `Promise<IJobListRowData[]>` with an `IJobListRowData` shape declared in this file or in `src/types/job.ts` if shared. Commit.
- [ ] **Step 2: JobView.tsx** — Container with options menu (Re-sync, Disconnect). Commit.
- [ ] **Step 3: PanelView.tsx** — Container. Per-row state. Commit.
- [ ] **Step 4: App.tsx** — Router-equivalent. The route table uses `/job/:id`, `/job/:id/checklist` etc. Commit.
- [ ] **Step 5: main.tsx** — Entry. `ReactDOM.createRoot(...)` typing. Commit.
- [ ] **Step 6: Update index.html script reference**

The Vite entry point in `index.html` references `/src/main.jsx`. Edit `index.html` so the script tag points to `/src/main.tsx`. (Vite resolves either extension, but be explicit.)

Commit:
```
git commit -m "refactor: point index.html entry at src/main.tsx"
```

- [ ] **Step 7: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e && npm run build
```

---

## Task 5: Convert scripts/*.mjs → *.mts

**Files:**
- `scripts/e2e-test.mjs` → `scripts/e2e-test.mts`
- `scripts/gen-fixtures.mjs` → `scripts/gen-fixtures.mts`
- `scripts/_local/generate-icons.mjs` → `scripts/_local/generate-icons.mts`

- [ ] **Step 1: e2e-test.mts**

```bash
git mv scripts/e2e-test.mjs scripts/e2e-test.mts
```

Add types throughout. Imports of `src/exporter.ts`, `src/lib/xlsxParser.ts`, etc., work via `tsx`. `fake-indexeddb` has community types — install if not present:
```bash
npm install --save-dev @types/fake-indexeddb || true
```
(If `fake-indexeddb` ships its own types now, skip.)

Update `package.json`:
```json
"test:e2e": "tsx scripts/e2e-test.mts"
```

Run:
```bash
npm run test:e2e
```
Expected: green, sample-export artifact produced.

Commit:
```
git commit -m "refactor(ts): convert e2e-test script to TypeScript

Now runs via tsx scripts/e2e-test.mts."
```

- [ ] **Step 2: gen-fixtures.mts**

```bash
git mv scripts/gen-fixtures.mjs scripts/gen-fixtures.mts
```

Type throughout. Add a `package.json` script if there isn't one already:
```json
"gen:fixtures": "tsx scripts/gen-fixtures.mts"
```

Verify by running it (regenerates `src/lib/__fixtures__/*.xlsx`):
```bash
npm run gen:fixtures
```
Expected: fixtures regenerated; `git diff src/lib/__fixtures__/` should be byte-for-byte identical (since the underlying logic didn't change). If a diff appears, investigate — the conversion may have changed behavior.

Commit:
```
git commit -m "refactor(ts): convert gen-fixtures script to TypeScript"
```

- [ ] **Step 3: generate-icons.mts**

```bash
git mv scripts/_local/generate-icons.mjs scripts/_local/generate-icons.mts
```

Type throughout. This script is local-only (presumably generates PWA icons from a source). Don't add a public npm script.

Commit:
```
git commit -m "refactor(ts): convert generate-icons local script to TypeScript"
```

- [ ] **Step 4: Suite check**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e && npm run build
```

---

## Task 6: Convert vite.config.js → vite.config.ts

**Files:**
- `vite.config.js` → `vite.config.ts`

- [ ] **Step 1: Rename and type**

```bash
git mv vite.config.js vite.config.ts
```

Edit `vite.config.ts`. Replacements:
- `defineConfig` from `vite` (already typed).
- The custom plugin's return type: `Plugin` from `vite`.
- `readFileSync`/`writeFileSync` from `node:fs` already typed.
- `JSON.parse(...)` result for `version.json` should be typed via an explicit interface:
  ```ts
  interface IVersionFile { version: string }
  const { version: BUILD_VERSION } = JSON.parse(
      readFileSync(resolve(import.meta.dirname, 'version.json'), 'utf8')
  ) as IVersionFile
  ```

The `injectSwVersion` plugin's `closeBundle` hook returns `void` or `Promise<void>` — keep the existing synchronous form.

Confirm the typecheck path:
```bash
npx tsc --noEmit -p tsconfig.node.json
```
Expected: zero errors.

- [ ] **Step 2: Run a full build**

```bash
npm run build
```
Expected: clean. `dist/service-worker.js` should have the literal `__BUILD_VERSION__` replaced with the actual version (verify: `grep -c __BUILD_VERSION__ dist/service-worker.js` → expect `0`).

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts package.json
git commit -m "refactor(ts): convert vite.config to TypeScript

injectSwVersion plugin typed via Plugin from 'vite'. version.json
parsing typed via IVersionFile interface."
```

---

## Task 7: Final ESLint cleanup — remove JS transition block

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Confirm no .js/.jsx files remain in src/ or scripts/**

```bash
find src scripts -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.mjs" \) | wc -l
```
Expected: `0`.

If non-zero: a file was missed. Convert it before continuing.

- [ ] **Step 2: Remove the transition blocks from eslint.config.js**

Delete the two transition blocks added in Plan B:
- The `src/**/*.{js,jsx}` block (with `react/react-in-jsx-scope: 'off'`, `react/prop-types: 'off'`, etc.).
- The `src/lib/*.test.js` block.
- The `scripts/**/*.{js,mjs}` block — replace with a TS-aware scripts block:
  ```js
  {
      files: ['scripts/**/*.mts', '*.config.ts'],
      languageOptions: {
          parser: tsParser,
          parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module',
              project: './tsconfig.node.json',
              tsconfigRootDir: __dirname,
          },
          globals: { ...globals.node },
      },
      plugins: { '@typescript-eslint': tsPlugin },
      rules: {
          ...tsPlugin.configs.recommended.rules,
          'no-console': 'off',  // scripts may log
      },
  },
  ```

- [ ] **Step 3: Verify lint still passes**

```bash
npm run lint
```
Expected: zero errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): remove JS transition blocks from eslint.config.js

No .js/.jsx/.mjs files remain in src/ or scripts/. eslint.config.js
now only lints .ts/.tsx and scripts/*.mts."
```

---

## Task 8: Final verification (most comprehensive — pre-release)

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
Expected: all six exit 0. Zero warnings.

- [ ] **Step 2: Confirm zero JS files**

```bash
find src scripts -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.mjs" \) -print
ls vite.config.* 2>/dev/null
```
Expected: no output from `find`. `vite.config.ts` is the only `vite.config.*`.

- [ ] **Step 3: Confirm version stamp + service worker**

```bash
npm run build
grep -c __BUILD_VERSION__ dist/service-worker.js
node -e "console.log(require('./version.json').version)"
```
Expected: `grep` returns `0`. Version reads correctly.

- [ ] **Step 4: Tailscale preview hands-on walkthrough (full app)**

```bash
npm run build
npm run preview -- --host &
PREVIEW_PID=$!
sleep 3
tailscale serve --bg https+insecure://localhost:4173
tailscale serve status
```

Post the resulting Tailscale URL.

Full walkthrough — agent runs on Mac browser, then user re-tests from real devices (iPhone, Android wrapper, Windows laptop):

**Job + panel CRUD:**
- Create job from sample seed. Rename it. Delete it (undo within 6s). Re-delete (commit).
- In a job, add a panel; rename; delete with undo; commit delete.
- Verify per-job and per-panel completion % updates.

**Photo capture:**
- Camera path: capture a photo; overlay metadata correct (job/panel/row labels, timestamp, GPS if available).
- Library path: pick an image with EXIF GPS; overlay shows the EXIF GPS, not device GPS.
- Library path: pick an image without EXIF; overlay shows no GPS or falls back per spec.
- Open lightbox; navigate forward/back; close.

**xlsx export:**
- Export job (zip mode). Open the zip; verify xlsx + photos inside. Open xlsx in Excel: native cell checkboxes, table refs span all data rows, autofilter clean, Notes appendix present and aligned.
- Export job (xlsx-only mode). Open xlsx; verify same as above without the photos.

**SharePoint round-trip:**
- Pull-as-new: open Pull-or-New modal; select an existing xlsx; confirm DiffView shows the contents; create the new job; verify job appears with the expected source kind=xlsx.
- Re-sync no-op: with an unchanged xlsx, run Re-sync; ResyncDialog shows zero changes. Confirm.
- Re-sync with changes: modify a few cells in the xlsx (externally), re-sync; ResyncDialog shows the changes; accept some, reject others via keep/drop pills; confirm; verify state.

**App shell:**
- Install banner: on a non-installed browser, banner appears above hero. Tap → install prompt (Chrome/Android/desktop) or iOS Share-instructions modal.
- Theme toggle: light ↔ dark; `--energy` color used on InstallBanner background in both themes.
- Keyboard inset on mobile viewport: focus an input near the bottom; SaveBar lifts; toast-host and FAB lift; modals lift.
- Update pill / SW update: trigger a fresh build with bumped version locally; reload; UpdatePill appears.
- Wrapper bridge: if Android wrapper available, confirm `wrapper:hello` → `app:ready` exchange; back button works; share-target works.

**Persistence:**
- Reload page mid-edit; all data persists.
- Close + reopen browser; data persists.

- [ ] **Step 5: Push branch + open PR**

```bash
git push origin feature_1/story_4
gh pr create --base feature_1/main --head feature_1/story_4 \
  --title "feature_1/story_4: components + scripts → TypeScript strict (final)" \
  --body "$(cat <<'EOF'
## Summary
- All src/components/*.jsx converted to .tsx with IProps interfaces
- src/App.tsx, src/main.tsx
- scripts/*.mjs → *.mts (e2e-test, gen-fixtures, generate-icons)
- vite.config.js → vite.config.ts
- eslint.config.js JS-transition blocks removed; no .js/.jsx remains

## Related
- Feature 1 / Story 4 (terminal story for this feature)
- Spec: docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md

## Test plan
- [ ] All five CI jobs green (build, e2e-export, unit-test, lint-and-typecheck)
- [ ] Full app walkthrough on Tailscale preview green
- [ ] Excel-side xlsx review green
- [ ] Real-device QA from user
EOF
)"
```

Wait for all five CI jobs green.

- [ ] **Step 6: Produce confidence rating**

```
Confidence: NN%
Automated: lint ✅ | tsc ✅ | unit (n/n) ✅ | e2e ✅ | build ✅
Hands-on:
- Job + panel CRUD intact (create/rename/delete/undo).
- Photo capture (camera + library) overlay metadata + EXIF GPS correct.
- xlsx export (zip + xlsx-only) opens correctly in Excel; cell checkboxes native, tables/autofilter intact.
- SharePoint pull-as-new + resync (no-op + with-changes) correct.
- Install banner light + dark themes correct (--energy background).
- Keyboard inset, theme, update pill, settings, wrapper bridge all correct.
- IDB persistence across reload + browser restart intact.
Known gaps/risks: <list or "none">
Tailscale URL: https://...
```

If < 95%, fix and re-test.

- [ ] **Step 7: User-side QA gate**

**Do NOT merge yet.** Hand off the Tailscale URL to the user. Wait for explicit user approval after their hands-on testing. The 95% rating is necessary but not sufficient — the user's OK is the merge gate.

---

## Task 9: Merge to develop + cut release branch

**Files:**
- Modify: `version.json` (bump minor)

- [ ] **Step 1: Merge story_4 into feature_1/main**

After user approval:
```bash
gh pr merge $(gh pr view --json number -q .number) --merge --delete-branch=false
git checkout feature_1/main && git pull --ff-only origin feature_1/main
```

- [ ] **Step 2: Merge feature_1/main into develop**

```bash
git checkout develop
git pull --ff-only origin develop
git merge --no-ff feature_1/main -m "Merge feature_1: eTech standards adoption + TS strict migration

Implements the full eTech Coding Standards (TypeScript .eslintrc.cjs +
README/branching/release-branch policy + PR template) and converts the
e-OIC codebase to TypeScript with strict: true.

- Plan A (story_1): repo/process baseline
- Plan B (story_2): TS scaffolding + tooling
- Plan C (story_3): src/lib + src/db + src/exporter + src/photoOverlay
- Plan D (story_4): src/components + scripts + vite.config + final

Spec: docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md"
git push origin develop
```

Wait for CI to run the four gating jobs on `develop`. Confirm green. No deploy fires (per Plan A's workflow change).

- [ ] **Step 3: Bump version + cut release branch**

```bash
CURRENT=$(node -p "require('./version.json').version")
NEXT_MINOR=$(node -p "const [a,b]=require('./version.json').version.split('.'); \`\${a}.\${Number(b)+1}.0\`")
echo "Current: $CURRENT  Next minor: $NEXT_MINOR"

git checkout -b "releases/v$NEXT_MINOR"
node -e "const fs=require('fs'); const v=require('./version.json'); v.version='$NEXT_MINOR'; fs.writeFileSync('./version.json', JSON.stringify(v)+'\n');"
git add version.json
git commit -m "release: v$NEXT_MINOR — TypeScript strict + eTech standards"
git push -u origin "releases/v$NEXT_MINOR"
```

- [ ] **Step 4: Watch the release deploy**

```bash
gh run watch
```
Expected: all five gating jobs + `deploy` succeed. Pages URL serves the new version.

- [ ] **Step 5: Verify deploy**

Visit the Pages URL. Confirm:
- Footer/about screen shows v<NEXT_MINOR>.
- Service worker active.
- No console errors.
- App functional end-to-end (smoke a job CRUD path).

If anything is wrong, cut a `releases/v<NEXT_MINOR>.1` hotfix branch from `releases/v<NEXT_MINOR>`.

---

## Task 10: Save memory + close out the migration

This is the **last step of Plan D** and the **terminal step of feature_1**. Run before declaring done.

**Files:**
- Modify: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic_etech_migration.md`
- Modify: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic.md`
- Modify: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/MEMORY.md`

- [ ] **Step 1: Capture release SHA**

```bash
RELEASE_SHA=$(git rev-parse HEAD)
RELEASE_VERSION=$(node -p "require('./version.json').version")
echo "Release SHA: $RELEASE_SHA  Version: v$RELEASE_VERSION"
```

- [ ] **Step 2: Mark Plan D complete in migration memory**

Edit `project_eoic_etech_migration.md`:
- Mark Plan D `[x]` with merge SHA + date.
- Add under "Decisions locked in":
  - Release branch `releases/v<RELEASE_VERSION>` deployed at `<RELEASE_SHA>`.
  - Standards adoption is complete; subsequent work uses `develop` + `feature_#/story_#` + `releases/v*` workflow as the baseline.
- Append a "Status: Complete" line at the top.

- [ ] **Step 3: Update top-level project memory**

Edit `project_eoic.md` (the main e-OIC status memory). Add a new section at the top:

```markdown
**As of YYYY-MM-DD — TypeScript strict + eTech Coding Standards (feature_1 complete):**
- Codebase is now TypeScript with strict: true + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
- ESLint flat config encodes eTech standards verbatim (Airbnb + airbnb-typescript via FlatCompat).
- Trunk is develop; deploys fire only from releases/v* branches.
- Domain types in src/types/{db,job,xlsx,sharepoint,wrapper}.ts; ambient piexifjs.d.ts.
- Unit-test runner: tsx --test 'src/lib/*.test.ts'.
- Released as v<RELEASE_VERSION>.
- Workflow: branch off develop → feature_#/story_# → merge to feature_#/main → merge to develop → cut releases/vX.Y.Z to deploy.
```

Update the description-frontmatter "as of v35" line to reflect v<RELEASE_VERSION> + TS.

- [ ] **Step 4: Add a feedback memory if anything notable came up**

If during this migration any non-obvious decision was made (e.g., a specific 3rd-party type quirk, a refactor pattern that worked particularly well, an eslint-disable that needs future review), write a brief feedback memory in `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/feedback_eoic_ts_migration.md`. Otherwise skip this step.

- [ ] **Step 5: Update MEMORY.md index**

Edit `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/MEMORY.md`:
- Update the `project_eoic.md` entry's trailing hook to mention TS + standards adoption.
- Update the `project_eoic_etech_migration.md` entry's trailing hook to: `Complete; released as v<RELEASE_VERSION>`.

- [ ] **Step 6: Final handoff message**

```
✅ Plan D complete.
✅ feature_1 (eTech standards + TS strict migration) complete.

Released: v<RELEASE_VERSION>
Release SHA: <RELEASE_SHA>
Pages URL: <pages-url>

What's done:
- Trunk: develop
- TypeScript strict + tightening flags across src + scripts + vite.config
- ESLint: standards-verbatim flat config
- Domain types: src/types/
- Unit runner: tsx --test
- Workflow: develop → feature_#/story_# → feature_#/main → develop → releases/v*
- PR template, code-review checklist in place

Memory updated:
- project_eoic_etech_migration.md (marked complete)
- project_eoic.md (TS-era status)
- MEMORY.md (index)

No downstream plan. Feature 1 is closed.
```

---

## Self-Review Checklist

- [ ] Every `.jsx` and `.mjs` file is renamed and typed.
- [ ] `vite.config.ts` exists; `vite.config.js` does not.
- [ ] No `.js`/`.jsx`/`.mjs` files in `src/` or `scripts/` (verified by `find`).
- [ ] `eslint.config.js` no longer contains JS-transition blocks.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npm run build` all green.
- [ ] All five CI jobs green on the release branch.
- [ ] Pages deploy succeeded; version stamp + service-worker correct.
- [ ] Migration memory marked Complete; project memory updated with TS-era status.
- [ ] User-side QA gate honored (push happened only after user OK on Tailscale preview).
