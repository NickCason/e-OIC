# eTech Coding Standards Alignment + TypeScript Strict Migration — Design

**Date:** 2026-05-12
**Status:** Approved — ready for plan-writing
**Driver:** Nick Cason
**Scope:** Full eTech Group Coding Standards adoption (code + repo/process) and conversion of the entire e-OIC codebase to TypeScript with `strict: true`.

---

## 1. Goals

1. Full eTech Coding Standards compliance for the e-OIC repo: every rule in `Coding-Standards-master/TypeScript/.eslintrc.cjs` applied verbatim, and the repo/process rules from `Coding-Standards-master/README.md` (branching, PR template, code reviews, release branches) adopted as written.
2. TypeScript with `"strict": true` end-to-end. No remaining `.js` / `.jsx` / `.mjs` files in `src/` or `scripts/`; `vite.config.ts` replaces `vite.config.js`.
3. Adopt rules verbatim. Where existing code conflicts (notably `max-depth: 2` in the xlsx surgery code), refactor the code, not the rule. Narrow per-block disables are acceptable only with a written justification and remain rare.
4. Verification gate before every user-side QA handoff: automated suite green + agent-driven hands-on walkthrough + ≥95% written confidence + Tailscale-served preview URL posted. **Push to remote is a separate explicit gate — the user's OK after hands-on QA, not the 95% rating.**

## 2. Non-Goals

- Feature work. No new functionality lands in this migration. Behavior is preserved exactly; any visible change is a regression and a blocker.
- Test coverage expansion beyond porting existing tests. (A few targeted tests may be added if a refactor reveals an obvious gap.)
- Rule deviations / customizations of the standards. Verbatim adoption is the rule.
- Switching test runners away from `node:test` unless required by the TS strategy in Plan B.
- Migration of `e-OIC-android-wrapper` (separate repo, separate effort).

## 3. Constraints & Acknowledged Costs

- **Big-bang on a long-lived branch.** Feature work pauses until merge. Estimated 1–3 weeks of paused shipping. Bug-only hotfixes still flow on `develop` and are cherry-picked into the migration branch.
- **GitHub Pages currently deploys from `main`.** Renaming → `develop` requires updating: Pages source-branch setting, all workflow triggers, README badges, internal docs.
- **Deploys move to release branches only.** Per strict standards reading, Pages deploy fires only from `releases/vX.Y.Z` branches. `develop` runs gating jobs but does not deploy. Daily demo cadence is preserved by cutting fresh release branches as needed.
- **`node:test` + TS.** The runner has no native TS support. Strategy decided in Plan B: most likely `tsx --test` or compile-first via `tsc` build output.
- **3rd-party type availability.** `idb` ships types; `exceljs` ships types since 4.x; `piexifjs` lacks types — a minimal local `src/types/piexifjs.d.ts` will be hand-written covering the surface we use.
- **Refactoring impact.** `max-depth: 2` will require extracting helper functions in `src/exporter.js`, `src/lib/xlsxParser.js`, possibly `src/lib/jobDiff.js` and `src/db.js`. Behavior must remain bit-for-bit identical; unit/e2e tests guard this.

## 4. Architecture: Target End-State

### 4.1 ESLint configuration

- Single `eslint.config.js` (flat config, ESLint 9) encoding every rule from `Coding-Standards-master/TypeScript/.eslintrc.cjs` verbatim.
- Flat-config equivalents for: `eslint:recommended`, `airbnb` (via `eslint-config-airbnb` + `FlatCompat` shim from `@eslint/eslintrc`), `airbnb/hooks`, `plugin:react/jsx-runtime`, `plugin:jsx-a11y/recommended`, `plugin:@typescript-eslint/recommended`, `plugin:react-hooks/recommended`.
- Explicit rule overrides (preserved verbatim):
  - `indent: ["error", 4]`
  - `semi: ["error", "always"]`
  - `no-console: ["error", { allow: ["warn", "error", "trace"] }]`
  - `max-depth: ["error", 2]`
  - `arrow-body-style: ["off", "always"]`
  - `comma-dangle: "off"`, `linebreak-style: "off"`, `class-methods-use-this: "off"`, `lines-between-class-members: "off"`, `no-shadow: "off"`, `max-len: "off"`, `no-nested-ternary: "off"`, `nonblock-statement-body-position: "off"`, `curly: "off"`
  - `object-curly-newline` per standards form
  - `react/function-component-definition: ["error", { namedComponents: "arrow-function", unnamedComponents: "function-expression" }]`
  - `import/extensions: ["error", "never"]`
  - `import/no-unresolved: "off"`
  - `react/no-unescaped-entities: "off"`
  - `react/destructuring-assignment: "off"`
  - `react/jsx-indent: "off"`
  - `react/jsx-indent-props: ["error", 4]`
  - `react/jsx-filename-extension: [1, { extensions: [".ts", ".tsx"] }]`
  - `react/require-default-props: "off"`
  - `react-hooks/rules-of-hooks: "error"`
  - `react-hooks/exhaustive-deps: "warn"`
  - `react-refresh/only-export-components: ["warn", { allowConstantExport: true }]`
  - `@typescript-eslint/no-shadow: "error"`
  - `@typescript-eslint/member-delimiter-style: ["error", { multiline: { delimiter: "none", requireLast: false } }]`
  - `@typescript-eslint/naming-convention: ["error", { selector: "interface", format: ["PascalCase"], custom: { regex: "^I[A-Z]", match: true } }]`
- Plugins: `react-refresh`, `jsx-a11y`, `no-autofix`. (Per standards.)
- File header comment cites `Coding-Standards-master/TypeScript/.eslintrc.cjs` as the source.
- `ignorePatterns` covers `dist/`, build artifacts, generated icons.
- Lint runs over `.ts`/`.tsx` files. Project no longer contains `.js`/`.jsx` source after Plan D.

### 4.2 TypeScript configuration

- Root `tsconfig.json` for app code; `tsconfig.node.json` for Vite config and `scripts/`.
- App `tsconfig.json` compiler options:
  - `"strict": true` (family: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `alwaysStrict`, `useUnknownInCatchVariables`, `noImplicitThis`)
  - Tightening: `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"exactOptionalPropertyTypes": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`
  - `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`
  - `"jsx": "react-jsx"`, `"verbatimModuleSyntax": true`
  - `"allowJs": false`, `"skipLibCheck": true`
  - `"isolatedModules": true`, `"esModuleInterop": true`, `"resolveJsonModule": true`
  - `"types": ["vite/client"]`
  - `"include": ["src", "src/types"]`, `"exclude": ["dist", "node_modules"]`
- `tsconfig.node.json`:
  - Extends app config but switches `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"types": ["node"]`, `"noEmit": true`
  - `"include": ["vite.config.ts", "scripts/**/*.mts"]`

### 4.3 File layout (structurally unchanged, all renamed)

- `src/**/*.jsx` → `*.tsx`
- `src/**/*.js` → `*.ts`
- `src/lib/*.test.js` → `*.test.ts`
- `scripts/*.mjs` → `*.mts`
- `vite.config.js` → `vite.config.ts`
- New `src/types/` directory holding:
  - `src/types/db.ts` (IDB `DBSchema` for `idb`'s generic)
  - `src/types/job.ts` (Job, Panel, Row, Photo, JobSource shapes)
  - `src/types/xlsx.ts` (parsed-xlsx shape, diff/decision shapes, parser warning union)
  - `src/types/sharepoint.ts` (pull/resync types)
  - `src/types/wrapper.ts` (Android wrapper postMessage union)
  - `src/types/piexifjs.d.ts` (minimal ambient declarations)

### 4.4 Naming conventions (per standards)

- Interfaces: `IPascalCase`. Used for component prop shapes and structural object types.
- Type aliases: `PascalCase` (no `I` prefix). Used for unions, discriminated unions, primitives, function types.
- React components: arrow-function form (`const Foo: React.FC<IFooProps> = ({ ... }) => { ... }`) per `react/function-component-definition` rule.
- File names: unchanged from current convention.

### 4.5 Repo / process changes

- **Trunk rename:** `main` → `develop`. Update:
  - GitHub repo Pages source-branch setting → `releases/v*` pattern (or whichever Pages publishing model survives — investigate in Plan A).
  - All `.github/workflows/*.yml` triggers reference `develop` and `releases/v*`.
  - README badges, links, docs.
  - `.git/HEAD` default branch.
- **Migration long-lived branch:** `feature_1/main` (using feature ID `1` for the migration as the first feature created post-standards-adoption; revise if a tracker assigns a different ID).
- **Story branches:** Each of the 4 plans corresponds to one story branch:
  - Plan A → `feature_1/story_1` (repo/process baseline)
  - Plan B → `feature_1/story_2` (TS scaffolding + tooling)
  - Plan C → `feature_1/story_3` (lib + exporter typed)
  - Plan D → `feature_1/story_4` (components + scripts + final)
- **Release branches:** A new minor-bump release branch (e.g. `releases/v0.94.0` — exact value read from `version.json` at cut time and bumped one minor) is cut from `develop` after `feature_1/main` merges. Deploys fire only from `releases/v*`.
- **PR template:** Port `Coding-Standards-master/C#/pull_request_template.md` to `.github/pull_request_template.md`, adjust wording for TS where the C# is language-specific but preserve the checklist structure.

### 4.6 CI changes

- Existing 4 gating jobs remain: `build`, `e2e-export`, `unit-test`, `lint`.
- Job steps updated for TS:
  - `lint`: `eslint .` with type-aware parser (`parserOptions.project: "./tsconfig.json"`).
  - `unit-test`: TS test execution strategy from Plan B (most likely `tsx --test 'src/**/*.test.ts'`).
  - `e2e-export`: runs `scripts/e2e-test.mts` via `tsx`.
  - `build`: `tsc --noEmit && vite build`.
- New `typecheck` step folded into `build` job (alternatively split as a 5th gate; decided in Plan B).
- Workflow triggers:
  - `develop` push → run all 4 gating jobs, no deploy.
  - `releases/v*` push → run all 4 gating jobs, **deploy to Pages on green**.
  - PR → run all 4 gating jobs on the PR.

### 4.7 Type strategy for hard cases

- **IDB:** Define a single `IEoicDBSchema extends DBSchema` in `src/types/db.ts` enumerating the v4 store shapes. The v3→v4 upgrade path (one-time photos wipe) stays in `db.ts`; the schema type reflects v4 final state. `openDB<IEoicDBSchema>(...)` everywhere.
- **ExcelJS:** Use library-provided types. `noUncheckedIndexedAccess` will force guards on `Workbook.getWorksheet(name)`, `worksheet.getRow(n).getCell(m)`, etc. Expect 30–50 narrowing fixes concentrated in `exporter.ts` and `xlsxParser.ts`.
- **piexifjs:** Hand-written `src/types/piexifjs.d.ts` covering `load(binary): IExifData`, `dump(data): string`, `GPSIFD` constants, and the GPS sub-IFD shape. Narrow only to what `photoExif.ts` uses.
- **Android wrapper bridge:** Discriminated union of message variants in `src/types/wrapper.ts`. Exhaustiveness check via `assertNever` helper.

### 4.8 Refactoring for `max-depth: 2`

Concentrated in four files. Refactors are behavior-preserving extractions of helper functions; tests must remain green at every commit.

- **`src/exporter.ts` `fixZip` block:** Extract one helper per fix-up step (e.g., `stripFeaturePropertyBag`, `reorderTableParts`, `repairAutoFilter`, `replicateExampleRowStyles`, `rewriteCellXfRefs`). Each helper takes the relevant DOM/zip slice and returns the transformed result.
- **`src/lib/xlsxParser.ts`:** Extract per-sheet, per-row, per-cell handlers. The recovery-of-Notes-appendix logic likely gets its own function.
- **`src/lib/jobDiff.ts`:** Mostly flat already. If `valuesEqual` or the row-matching inner loop trips `max-depth`, extract.
- **`src/db.ts`:** Extract per-store transaction helpers if the upgrade path or transaction blocks trip the rule.

Where extraction would harm readability (rare), `// eslint-disable-next-line max-depth -- <reason>` is acceptable but must be flagged in the PR for review. Default is always: refactor.

## 5. Data Flow / Plan Dependencies

```
Plan A (repo/process) ──┐
                        ├─→ Plan B (TS scaffolding) ──→ Plan C (lib + exporter) ──→ Plan D (components + scripts)
                        ┘
```

- Plans A and B are independent in principle (A is process-only, B is tooling). Execution is serial for cleanliness: A first, then B.
- Plan C depends on Plan B (needs tsconfig, ESLint, type packages, `tsx` installed).
- Plan D depends on Plan C (components import from `lib/`; the imports must already be typed).
- All four plans land on their `feature_1/story_N` branch, which merges into `feature_1/main`. After Plan D merges and the migration branch passes its final verification, `feature_1/main` merges into `develop`. A `releases/v<next-minor>.0` branch is cut from `develop` (current `version.json` value bumped one minor) and pushed; Pages deploys.

### Hotfix path during migration

- Critical production bug: branch from latest `releases/v<current>.x` → fix → cut `releases/v<current>.(x+1)` → deploy. Cherry-pick the fix into `feature_1/main`.
- Non-critical: queue until migration merge.

## 6. Failure Modes & Verification

### 6.1 Verification gate (every plan)

Every plan ends with the same verification block. Agents must:

1. Run automated suite and confirm green:
   - `npm run lint` — zero errors, zero warnings (warnings fail the build under strict standards).
   - `tsc --noEmit` (or `npm run typecheck`) — zero errors.
   - `npm run test:unit` — all green.
   - `npm run test:e2e` — green, sample-export artifact produced.
   - `npm run build` — clean.
2. Run hands-on walkthrough scripted in the plan. Plan A's walkthrough is the deploy-path test; Plan B's is a smoke test; Plans C and D have explicit checklists.
3. Build production bundle, run `vite preview --host`, expose via `tailscale serve --bg https+insecure://localhost:4173` (or current configured form).
4. Produce a confidence rating in this exact format:

   ```
   Confidence: NN%
   Automated: lint ✅ | tsc ✅ | unit (n/n) ✅ | e2e ✅ | build ✅
   Hands-on: <bulleted list of what was exercised>
   Known gaps/risks: <bulleted list, or "none">
   Tailscale URL: https://...
   ```

5. If confidence honestly lands below 95%, fix and re-test rather than handing off. Surface gaps explicitly; do not round up.
6. After agent confidence ≥ 95%, hand off to user. Push to remote is a separate explicit gate — wait for user's OK after hands-on QA.

### 6.2 Known failure modes

- **`noUncheckedIndexedAccess` narrowing churn** in `exporter.ts` and `xlsxParser.ts` — expected, addressed by adding explicit guards. Do not work around by widening types.
- **Airbnb's `import/extensions: "never"` vs Vite's resolver** — should work cleanly with ESLint flat config and TS. If a conflict appears, fix imports, don't relax the rule.
- **Lint warnings as build failures** — `react-hooks/exhaustive-deps` is `warn` per standards; CI will treat warnings as failures (`eslint --max-warnings 0`). Existing inline disables (`// eslint-disable-next-line react-hooks/exhaustive-deps -- ...`) carry over with WHY comments preserved.
- **Test runner choice for TS** — Plan B decides between `tsx --test` and compile-first. If neither works cleanly, Vitest is the fallback (Vitest itself is not in the standards, but adopting it doesn't violate them either).

### 6.3 Rollback

- If a plan's verification cannot reach 95% and the gap is structural (e.g., an architectural mistake discovered mid-conversion), the plan author flags the issue, halts execution, and re-opens the spec. Do not merge a sub-95% plan and "fix later."
- The migration is reversible until merge into `develop`. `feature_1/*` branches can be discarded at any point.

## 7. Testing

### 7.1 Automated (CI gating)

- `lint`: ESLint flat config, `--max-warnings 0`, runs over `src/**/*.{ts,tsx}`.
- `typecheck`: `tsc --noEmit` against `tsconfig.json` and `tsconfig.node.json`.
- `unit-test`: `node --test` via the Plan B TS strategy. Existing 36 tests across `xlsxParser`, `jobDiff`, `photoExif`, `rawSnapshot`, `paths`, `wrapperBridge` must remain green.
- `e2e-export`: `scripts/e2e-test.mts` via `tsx`. Parser round-trip + resync no-op + edit-detect assertions intact. `sample-export` artifact uploaded.
- `build`: `tsc --noEmit && vite build`.

### 7.2 Hands-on (per plan, before confidence rating)

- **Plan A**: Trigger a deploy from a test patch release branch cut from `develop` (e.g. `releases/v<current>.(patch+1)`). Confirm Pages updates, version stamp correct, no regression vs pre-rename behavior.
- **Plan B**: `npm run dev`, `npm run build`, `npm run preview`. App must run identically to pre-change.
- **Plan C**: Create a job from sample seed → export xlsx (zip + xlsx-only modes) → parse back via the e2e harness → confirm zero-diff resync. Visually verify a photo with overlay renders correctly in PhotoCapture, RowPhotos, Lightbox.
- **Plan D**: Full app walkthrough:
  - Job CRUD (create, rename, delete with undo)
  - Panel CRUD (add, rename, delete with undo, completion %)
  - Photo capture both source modes (camera + library), overlay metadata correct, EXIF GPS recovered
  - Lightbox navigation
  - xlsx export (zip mode + xlsx-only mode)
  - SharePoint pull-as-new and resync (no-op and with-changes)
  - Install banner (Android/desktop prompt + iOS fallback modal)
  - Theme toggle (light/dark)
  - Keyboard inset behavior on mobile viewport
  - Update pill / SW update flow
  - Settings view
  - Wrapper bridge messages (if Android wrapper available)

### 7.3 Tailscale preview procedure

```
npm run build
npm run preview -- --host
tailscale serve --bg https+insecure://localhost:4173
```

Agent posts the resulting `https://<hostname>.taild99f50.ts.net` URL in the handoff message. User tests from iPhone, Android wrapper, Windows laptop as needed. Push happens only after user's explicit OK.

## 8. Context-Clearing & Memory Handoff Between Plans

The user works subagent-driven across plans and clears context between executions. To make handoffs robust:

- **Last task of every plan** writes/updates a memory note in `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/` capturing:
  - Which plan finished, with the merge SHA into `feature_1/main`.
  - The exact filename of the next plan to execute, plus its branch name.
  - Any decisions made mid-plan that affect downstream plans (e.g., the TS test runner chosen in Plan B).
  - Any deferred gaps the user knowingly accepted.
- **Last task of every plan** also opens the next plan's markdown file and updates its "Prerequisites verified" section with concrete check marks tied to the merge SHA.
- The `project_eoic.md` memory is updated with the migration's high-level status (e.g., "Plan B complete on 2026-MM-DD, lib conversion next").

## 9. Open Questions (resolved)

- **Sequencing:** Brainstorm with full standards context first. ✅ Done.
- **Scope of "match standards":** Full standards including branching. ✅
- **Migration shape:** Big-bang on a long-lived branch. ✅
- **TS scope:** Everything (src + tests + scripts + vite config). ✅
- **Rule rigidity:** Adopt verbatim, refactor to comply. ✅
- **Deploy trigger:** Release branches only (`releases/v*`). ✅
- **Verification gate:** 95% agent confidence, Tailscale preview, push only on user OK. ✅
- **Memory + downstream-plan update at end of each plan:** Required. ✅

## 10. Out of Scope (Re-iterated)

- Feature work or behavior changes.
- e-OIC-android-wrapper repo migration.
- Test coverage expansion beyond porting.
- Rule customizations.
- Test-runner change unless forced by Plan B's TS strategy.
