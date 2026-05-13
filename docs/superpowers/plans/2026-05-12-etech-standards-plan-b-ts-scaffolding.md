# Plan B — TypeScript Scaffolding + Tooling (eTech Standards Adoption)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install TypeScript + eTech-standards-compliant ESLint flat config + type-aware tooling on e-OIC. No application code is converted in this plan — files remain `.js`/`.jsx`. After this plan, `tsc --noEmit` passes (over zero TS files), `npm run lint` passes against existing JS, and `npm run build` produces an identical app.

**Architecture:** Add `tsconfig.json` + `tsconfig.node.json` with `strict: true` + tightening flags. Rewrite `eslint.config.js` as a flat config that encodes every rule from `Coding-Standards-master/TypeScript/.eslintrc.cjs` verbatim using `FlatCompat` for Airbnb. Add `tsx` for TS test/script execution. Add CI `typecheck` step. Write minimal `piexifjs.d.ts`. No file renames.

**Tech Stack:** TypeScript 5.x, `@typescript-eslint/*`, `eslint-config-airbnb` (via `@eslint/eslintrc` `FlatCompat`), `eslint-plugin-jsx-a11y`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-plugin-no-autofix`, `tsx`.

**Spec:** `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`

**Branch for this plan:** `feature_1/story_2`
**Parent long-lived branch:** `feature_1/main`

---

## Prerequisites verified

- [x] `develop` is the remote default branch (set by Plan A).
- [x] `feature_1/main` exists on remote at SHA `a7a9b58af96a88d7ed17d65e949fd56cf94460bd`.
- [x] CI workflow `.github/workflows/deploy.yml` gates deploy on `releases/v*` (set by Plan A).
- [x] `.github/pull_request_template.md` present (set by Plan A).
- [x] Plan A merge SHA recorded: `a7a9b58af96a88d7ed17d65e949fd56cf94460bd`.
- [ ] Spec reviewed: `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`.
- [ ] Memory `project_eoic_etech_migration.md` shows Plan A complete.

---

## Plan chain

- **Previous (A):** Repo / process baseline — `docs/superpowers/plans/2026-05-12-etech-standards-plan-a-repo-process.md` (must be complete).
- **This plan (B):** TS scaffolding + tooling.
- **Next (C):** Lib + exporter conversion — `docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md`.
- **Then (D):** Components + scripts + final release — `docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md`.

---

## Task 1: Branch setup

**Files:**
- No file changes; git operations only.

- [ ] **Step 1: Update local feature_1/main**

```bash
git checkout feature_1/main
git pull --ff-only origin feature_1/main
```

- [ ] **Step 2: Create story_2 branch**

```bash
git checkout -b feature_1/story_2
git push -u origin feature_1/story_2
```

---

## Task 2: Install TypeScript + type-aware tooling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
npm install --save-dev \
  typescript@~5.6.0 \
  @types/react@~18.3.0 \
  @types/react-dom@~18.3.0 \
  @types/node@~20.0.0 \
  @typescript-eslint/parser@~8.0.0 \
  @typescript-eslint/eslint-plugin@~8.0.0 \
  tsx@~4.19.0 \
  @eslint/eslintrc@~3.1.0 \
  eslint-config-airbnb@~19.0.4 \
  eslint-config-airbnb-typescript@~18.0.0 \
  eslint-plugin-import@~2.31.0 \
  eslint-plugin-jsx-a11y@~6.10.0 \
  eslint-plugin-react-refresh@~0.4.14 \
  eslint-plugin-no-autofix@~2.1.0
```

Note: `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint`, `globals` are already installed (per current `package.json`).

- [ ] **Step 2: Confirm install**

```bash
npm ls typescript @typescript-eslint/parser eslint-config-airbnb
```
Expected: each shows a single resolved version with no missing-peer warnings.

- [ ] **Step 3: Add `typecheck` script**

Modify `package.json` `scripts` block to add:

```json
"typecheck": "tsc --noEmit"
```

And update the existing `test` aggregate script to include typecheck:

```json
"test": "npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e"
```

(`test:unit` and `test:e2e` remain JS for now — Task 4 wires `tsx` once TS files exist.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(tooling): install TypeScript + eTech-standards lint deps

- typescript 5.6 + @types/{react,react-dom,node}
- @typescript-eslint/{parser,eslint-plugin}
- eslint-config-airbnb + eslint-config-airbnb-typescript (via FlatCompat)
- eslint-plugin-{import,jsx-a11y,react-refresh,no-autofix}
- tsx for TS test/script execution
- @eslint/eslintrc for FlatCompat shim
- new npm script: typecheck"
```

---

## Task 3: Add tsconfig.json + tsconfig.node.json

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowJs": false,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "useDefineForClassFields": true,
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "src/types"],
  "exclude": ["dist", "node_modules"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowJs": false,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "noEmit": true,
    "composite": true
  },
  "include": ["vite.config.ts", "scripts/**/*.mts"],
  "exclude": ["node_modules", "dist"]
}
```

Note: `include` references `vite.config.ts` and `*.mts` files that don't exist yet (they're created in Plan D). Until then, `tsc --noEmit` for the node config will report no input files — that's fine; the build below explicitly handles this.

- [ ] **Step 3: Run typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: exit 0, no errors. With `include: ["src", "src/types"]` and no `.ts`/`.tsx` files yet, `tsc` should emit `error TS18003: No inputs were found in config file` — that's an error.

If TS18003 fires, add a sentinel placeholder file `src/types/placeholder.ts` containing exactly:

```ts
// Placeholder so tsconfig.json has at least one input file before Plan C renames
// any source. Delete this file in Plan C once real TS files exist.
export {};
```

Re-run: `npx tsc --noEmit -p tsconfig.json` → expect exit 0.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json tsconfig.node.json src/types/placeholder.ts
git commit -m "feat(tooling): add tsconfig.json + tsconfig.node.json (strict)

Compiler flags: strict family + noUncheckedIndexedAccess +
noImplicitOverride + noFallthroughCasesInSwitch + exactOptionalPropertyTypes
+ noUnusedLocals + noUnusedParameters. Plus verbatimModuleSyntax,
moduleResolution: bundler, jsx: react-jsx.

Sentinel src/types/placeholder.ts keeps tsc happy until Plan C renames
the first real .ts file."
```

---

## Task 4: Rewrite eslint.config.js as the standards-encoded flat config

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Read the standards source**

Run: `cat /tmp/coding-standards/Coding-Standards-master/TypeScript/.eslintrc.cjs`

This is the authoritative source. Every rule it contains must appear in the flat config below.

- [ ] **Step 2: Replace `eslint.config.js`**

Write exactly:

```js
// e-OIC ESLint flat config — encodes eTech Group TypeScript standards verbatim.
// Source of truth: Coding-Standards-master/TypeScript/.eslintrc.cjs
// (Coding-Standards-master.zip in the eTech Coding-Standards repo.)
//
// Do not deviate from these rules without explicit standards-owner approval.

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import noAutofix from 'eslint-plugin-no-autofix';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'public/service-worker.js', 'coverage/**'],
    },

    // Airbnb base (via FlatCompat) — applied to all TS/TSX
    ...compat.extends('airbnb', 'airbnb/hooks', 'airbnb-typescript').map((c) => ({
        ...c,
        files: ['src/**/*.{ts,tsx}'],
    })),

    // TypeScript + React rules
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
                ...globals.es2024,
                __BUILD_VERSION__: 'readonly',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react,
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            'jsx-a11y': jsxA11y,
            import: importPlugin,
            'no-autofix': noAutofix,
        },
        settings: {
            react: { version: 'detect' },
            'import/resolver': {
                typescript: { project: './tsconfig.json' },
                node: true,
            },
        },
        rules: {
            // From plugin:react/jsx-runtime
            ...react.configs['jsx-runtime'].rules,
            // From plugin:jsx-a11y/recommended
            ...jsxA11y.configs.recommended.rules,
            // From plugin:@typescript-eslint/recommended
            ...tsPlugin.configs.recommended.rules,
            // From plugin:react-hooks/recommended
            ...reactHooks.configs.recommended.rules,

            // Verbatim from Coding-Standards-master/TypeScript/.eslintrc.cjs:
            'arrow-body-style': ['off', 'always'],
            semi: ['error', 'always'],
            indent: ['error', 4],
            'no-console': ['error', { allow: ['warn', 'error', 'trace'] }],
            'comma-dangle': 'off',
            'linebreak-style': 'off',
            'class-methods-use-this': 'off',
            'lines-between-class-members': 'off',
            'max-depth': ['error', 2],
            'no-shadow': 'off',
            'object-curly-newline': ['error', {
                ObjectExpression: { multiline: true, minProperties: 3 },
                ObjectPattern: { multiline: true, minProperties: 4 },
                ImportDeclaration: 'never',
                ExportDeclaration: { multiline: true, minProperties: 3 },
            }],
            'react/function-component-definition': [2, {
                namedComponents: 'arrow-function',
                unnamedComponents: 'function-expression',
            }],
            'import/extensions': ['error', 'never'],
            'import/no-unresolved': 'off',
            'react/no-unescaped-entities': 'off',
            'react/destructuring-assignment': 'off',
            'react/jsx-indent': 'off',
            'react/jsx-indent-props': ['error', 4],
            'react/jsx-filename-extension': [1, { extensions: ['.ts', '.tsx'] }],
            'react/require-default-props': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            'max-len': 'off',
            'no-nested-ternary': 'off',
            'nonblock-statement-body-position': 'off',
            curly: 'off',
            '@typescript-eslint/no-shadow': 'error',
            '@typescript-eslint/member-delimiter-style': ['error', {
                multiline: { delimiter: 'none', requireLast: false },
            }],
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: { regex: '^I[A-Z]', match: true },
                },
            ],
        },
    },

    // Lint existing JS during the transition — Plan C/D rename files; this block
    // is removed in Plan D's final commit when no .js/.jsx remains.
    {
        files: ['src/**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: {
                ...globals.browser,
                ...globals.es2024,
                __BUILD_VERSION__: 'readonly',
            },
        },
        plugins: { react, 'react-hooks': reactHooks },
        settings: { react: { version: 'detect' } },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },

    // Scripts (Node ESM) — JS for now; .mts equivalents are created in Plan D
    {
        files: ['scripts/**/*.{js,mjs}', '*.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },

    // JS tests — same shape as src/ JS during transition
    {
        files: ['src/lib/*.test.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
];
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: zero errors. **The TS-only rules above don't fire on `.js`/`.jsx` files** (the `files` glob is `src/**/*.{ts,tsx}` for that block), so existing JS code is graded only by the transition rule-set in the second-to-last block — same as today. Result should be no new failures.

If new failures appear:
- They are most likely from `eslint-plugin-import` resolving paths differently. Fix in this commit.
- Or from the FlatCompat-loaded Airbnb base bleeding onto JS files — re-check the `files` glob constraint on the Airbnb spreads.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```
Expected: exit 0, no errors (only the placeholder.ts file is in `include`).

- [ ] **Step 5: Run build**

```bash
npm run build
```
Expected: clean build, identical to pre-change behavior.

- [ ] **Step 6: Run existing tests**

```bash
npm run test:unit
npm run test:e2e
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js
git commit -m "feat(lint): rewrite eslint.config.js to encode eTech standards verbatim

Loads Airbnb + airbnb-typescript via FlatCompat. Applies the full rule
set from Coding-Standards-master/TypeScript/.eslintrc.cjs to .ts/.tsx
files (Plans C/D produce those). Existing .js/.jsx files keep their
transition rule-set so the codebase still lints during conversion."
```

---

## Task 5: Write piexifjs ambient declarations

**Files:**
- Create: `src/types/piexifjs.d.ts`

- [ ] **Step 1: Inspect actual usage**

Run: `grep -n "piexif" src/lib/photoExif.js`

Note every function and constant referenced (e.g., `piexif.load`, `piexif.dump`, `piexif.GPSIFD.GPSLatitude`).

- [ ] **Step 2: Write the declaration**

Create `src/types/piexifjs.d.ts` covering only the observed surface:

```ts
declare module 'piexifjs' {
    export interface IGPSIFD {
        GPSLatitudeRef: number
        GPSLatitude: number
        GPSLongitudeRef: number
        GPSLongitude: number
        GPSAltitudeRef: number
        GPSAltitude: number
        GPSTimeStamp: number
        GPSDateStamp: number
    }

    export interface IExifData {
        '0th'?: Record<number, unknown>
        Exif?: Record<number, unknown>
        GPS?: Record<number, number | [number, number] | string>
        Interop?: Record<number, unknown>
        '1st'?: Record<number, unknown>
        thumbnail?: string | null
    }

    export const GPSIFD: IGPSIFD

    export function load(jpegBinary: string): IExifData
    export function dump(data: IExifData): string
    export function insert(exifStr: string, jpegBinary: string): string
    export function remove(jpegBinary: string): string
}
```

Adjust the surface above only to match what `photoExif.js` actually uses. Do not speculatively widen — narrow declarations are part of the standards adoption.

- [ ] **Step 3: Verify typecheck still passes**

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/types/piexifjs.d.ts
git commit -m "feat(types): ambient declarations for piexifjs

Narrow surface: load, dump, insert, remove, GPSIFD constants. Matches
the subset used by src/lib/photoExif.js. Extend only when new usage
appears."
```

---

## Task 6: Update CI workflow to include typecheck

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add the typecheck step into the existing `lint` job**

The lint job already runs `npm ci`. Add a `npm run typecheck` step immediately before `npm run lint`:

Find this block:
```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
```

Replace `- run: npm run lint` with:
```yaml
      - run: npm run typecheck
      - run: npm run lint
```

Rename the job from `lint` to `lint-and-typecheck` for clarity, and update the `deploy` job's `needs:` array to reference the new name:

```yaml
  deploy:
    needs: [build, e2e-export, unit-test, lint-and-typecheck]
```

- [ ] **Step 2: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add typecheck step (gates Pages deploy)

Renames the lint job to lint-and-typecheck and runs tsc --noEmit
before eslint. Deploy now requires all five checks: build, e2e-export,
unit-test, lint-and-typecheck."
```

---

## Task 7: Verification

**Files:**
- No file changes; verification commands only.

- [ ] **Step 1: Automated suite**

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```
Expected: all six exit 0.

- [ ] **Step 2: Smoke test the running app**

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 &
PREVIEW_PID=$!
sleep 3
curl -sf http://127.0.0.1:4173/ > /dev/null && echo "preview serves HTTP 200" || echo "preview FAILED"
kill $PREVIEW_PID 2>/dev/null
```

Expected: `preview serves HTTP 200`. (User-side hands-on QA is deferred to Plan D's final gate per `project_eoic_etech_migration.md` decisions.)

- [ ] **Step 3: Push branch + open PR**

```bash
git push origin feature_1/story_2
gh pr create --base feature_1/main --head feature_1/story_2 \
  --title "feature_1/story_2: TS scaffolding + tooling" \
  --body "$(cat <<'EOF'
## Summary
- TypeScript 5.6 + strict tsconfig (with noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- ESLint flat config encoding eTech standards verbatim
- piexifjs ambient declarations
- CI gains typecheck step
- No app code converted yet — all .js/.jsx unchanged

## Related
- Feature 1 / Story 2
- Spec: docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md

## Test plan
- [ ] All five CI jobs green
- [ ] App runs identically in preview
EOF
)"
```

Wait for all five CI jobs green.

- [ ] **Step 4: Produce confidence rating**

```
Confidence: NN%
Automated: lint ✅ | tsc ✅ (placeholder only) | unit (n/n) ✅ | e2e ✅ | build ✅ | preview HTTP 200 ✅
Known gaps/risks: <list or "none">
```

If < 95%, fix and re-test.

- [ ] **Step 5: Merge into feature_1/main**

```bash
gh pr merge $(gh pr view --json number -q .number) --merge --delete-branch=false
git checkout feature_1/main && git pull --ff-only origin feature_1/main
```

---

## Task 8: Save memory + update downstream plan files

This is the **last step of Plan B**. Run before declaring done so the user can `/clear` context before Plan C.

**Files:**
- Modify: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic_etech_migration.md`
- Modify: `docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md`

- [ ] **Step 1: Capture the merge SHA**

```bash
PLAN_B_MERGE_SHA=$(git rev-parse feature_1/main)
echo "Plan B merge SHA: $PLAN_B_MERGE_SHA"
```

- [ ] **Step 2: Update migration-status memory**

Edit `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic_etech_migration.md`:

Change `- [ ] Plan B — TS scaffolding + tooling. ...` to `- [x] Plan B — TS scaffolding + tooling. Merge SHA: <PLAN_B_MERGE_SHA>. Completed YYYY-MM-DD.`

Add under "Decisions locked in":
- TS test runner: `tsx --test` for `node:test`-style tests in TS. (Confirmed working in Task 4 ESLint run — actual switchover happens in Plan C when test files become .ts.)
- ESLint flat config strategy: FlatCompat + Airbnb base. File: eslint.config.js.
- Placeholder `src/types/placeholder.ts` exists; delete it in Plan C once a real .ts file is in place.

Update the MEMORY.md index entry's trailing hook to reflect Plan B done; Plan C next.

- [ ] **Step 3: Update Plan C's "Prerequisites verified" section**

Open `docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md`. Mark prerequisites as satisfied:
- [x] `tsconfig.json` and `tsconfig.node.json` exist with strict + tightening flags.
- [x] `eslint.config.js` encodes eTech standards verbatim (FlatCompat + Airbnb + Airbnb-TS + jsx-a11y + react-hooks + ts-eslint).
- [x] `tsx`, `@typescript-eslint/*`, Airbnb config packages installed.
- [x] `src/types/piexifjs.d.ts` present.
- [x] `src/types/placeholder.ts` exists (Plan C must delete it).
- [x] CI workflow has `typecheck` step in `lint-and-typecheck` job.
- [x] Plan B merge SHA recorded: `<PLAN_B_MERGE_SHA>`.

- [ ] **Step 4: Commit the Plan C update on a tiny handoff branch**

```bash
git checkout feature_1/main && git pull --ff-only origin feature_1/main
git checkout -b feature_1/story_2-handoff
git add docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md
git commit -m "chore(plan-handoff): mark Plan B prerequisites complete in Plan C"
git push -u origin feature_1/story_2-handoff
gh pr create --base feature_1/main --head feature_1/story_2-handoff \
  --title "Plan B → Plan C handoff" \
  --body "Records Plan B merge SHA in Plan C prerequisites."
gh pr merge --merge --delete-branch
git checkout feature_1/main && git pull --ff-only origin feature_1/main
```

- [ ] **Step 5: Final handoff message**

```
✅ Plan B complete.

Confidence: NN%
Plan B merge SHA: <PLAN_B_MERGE_SHA>
TypeScript: 5.6, strict + tightening flags active
ESLint: flat config encoding eTech standards verbatim
CI gate: build + e2e-export + unit-test + lint-and-typecheck → deploy

Memory updated: project_eoic_etech_migration.md
Next plan: docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md

Safe to /clear context. Plan C subagent should branch feature_1/story_3 from feature_1/main.
```

---

## Self-Review Checklist

- [ ] Every step has exact file path + exact code/command + expected output.
- [ ] No "TODO" / "TBD" / "implement later" language.
- [ ] Every rule from `Coding-Standards-master/TypeScript/.eslintrc.cjs` appears in `eslint.config.js`.
- [ ] tsconfig has `strict: true` + the tightening flags listed in the spec (Section 4.2).
- [ ] CI workflow lints + typechecks before deploy.
- [ ] Task 8 saves memory and updates Plan C's prerequisites section.
