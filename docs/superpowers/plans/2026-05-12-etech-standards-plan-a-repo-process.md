# Plan A — Repo / Process Baseline (eTech Standards Adoption)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt eTech Group's repo/process standards on e-OIC: rename trunk `main` → `develop`, add the PR template, and restructure CI so deploys fire only from `releases/v*` branches. No code-level changes.

**Architecture:** Pure repo + GitHub Actions + branch policy. Trunk becomes `develop`; story branches `feature_#/story_#` merge into `feature_#/main` which merges into `develop`; `releases/v*` branches are cut from `develop` and trigger Pages deploys.

**Tech Stack:** Git, GitHub Actions (`.github/workflows/deploy.yml`), GitHub repo settings (Pages source, default branch), Markdown PR template.

**Spec:** `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`

**Branch for this plan:** `feature_1/story_1`
**Parent long-lived branch:** `feature_1/main` (cut from current `main` at start of this plan)

---

## Prerequisites verified

- [ ] Working directory is `/Users/nickcason/DevSpace/Work/e-OIC` and current branch is `main`.
- [ ] `git status` clean — no uncommitted changes.
- [ ] eTech Coding Standards extracted at `/tmp/coding-standards/Coding-Standards-master/` (re-extract from `/Users/nickcason/DevSpace/Work/Coding-Standards-master.zip` if missing).
- [ ] Spec reviewed: `docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md`.

---

## Plan chain

- **This plan (A):** Repo / process baseline — **start here**.
- **Next (B):** TS scaffolding + tooling — `docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md`.
- **Then (C):** Lib + exporter conversion — `docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md`.
- **Then (D):** Components + scripts conversion + final release — `docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md`.

---

## Task 1: Branch setup for the migration

**Files:**
- No file changes; git operations only.

- [ ] **Step 1: Confirm clean state**

Run: `git status && git branch --show-current`
Expected: `working tree clean`, branch `main`.

- [ ] **Step 2: Pull latest main**

Run: `git pull --ff-only origin main`

- [ ] **Step 3: Create the long-lived migration branch**

Run: `git checkout -b feature_1/main && git push -u origin feature_1/main`

- [ ] **Step 4: Create the story branch for this plan**

Run: `git checkout -b feature_1/story_1 && git push -u origin feature_1/story_1`

- [ ] **Step 5: Verify both branches exist on remote**

Run: `git branch -r | grep feature_1`
Expected: `origin/feature_1/main` and `origin/feature_1/story_1` listed.

---

## Task 2: Add the PR template

**Files:**
- Create: `.github/pull_request_template.md`
- Source: `/tmp/coding-standards/Coding-Standards-master/C#/pull_request_template.md`

- [ ] **Step 1: Read the source template**

Run: `cat /tmp/coding-standards/Coding-Standards-master/C#/pull_request_template.md`

- [ ] **Step 2: Create `.github/pull_request_template.md`**

Port the checklist from the source. Replace any C#-specific wording with TS-appropriate equivalents (e.g., references to NuGet → npm; ReSharper/.editorconfig → ESLint/tsconfig). Preserve every checklist item's intent; only swap language-specific tooling names.

The template must include sections for: summary of changes, related feature/story IDs, testing performed, code review readiness checklist (covering: tests added/updated, lint clean, types compile, no console.log left in code, follows naming conventions, no commented-out code, no debug artifacts).

- [ ] **Step 3: Verify the file is loaded by GitHub**

Run: `ls -la .github/pull_request_template.md`
Expected: file exists, non-empty.

- [ ] **Step 4: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "feat(process): add eTech PR review checklist template

Ports Coding-Standards-master/C#/pull_request_template.md to a
TS-flavored equivalent. Part of feature_1 (eTech standards adoption)."
```

---

## Task 3: Restructure CI — split build/test gates from deploy

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Read the current workflow**

Run: `cat .github/workflows/deploy.yml`

- [ ] **Step 2: Rewrite the workflow**

Replace the file with the following exactly:

```yaml
name: e-OIC CI + Pages Deploy

# Gating jobs run on develop and releases/v*. Deploy fires only from releases/v*.
# Per eTech standards: develop is the trunk; releases/vX.Y.Z branches are cut
# from develop and trigger production deploys.
on:
  push:
    branches:
      - develop
      - 'releases/v*'
      - 'feature_*/**'
  pull_request:
    branches:
      - develop
      - 'feature_*/main'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  e2e-export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:e2e
      - name: Upload sample export
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: sample-export
          path: /tmp/eoic-e2e/
          if-no-files-found: error
          retention-days: 30

  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:unit

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

  deploy:
    needs: [build, e2e-export, unit-test, lint]
    if: startsWith(github.ref, 'refs/heads/releases/v')
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: gate deploy on releases/v* branches only

Per eTech standards, Pages deploys fire only from releases/vX.Y.Z
branches. develop and feature_*/* branches run the four gating jobs
(build, e2e-export, unit-test, lint) but do not deploy."
```

---

## Task 4: Rename README + docs references from `main` to `develop`

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/*.md` only if they reference `main` as the trunk in operational context
- Modify: `.github/pull_request_template.md` only if it references `main`

- [ ] **Step 1: Find references to `main` as trunk**

Run: `grep -rn -E '\b(main branch|push to main|merge to main|origin/main|branches?.*\[main\])' README.md docs/ .github/ 2>/dev/null`

- [ ] **Step 2: Update README**

For every operational reference to `main` (deploy trigger, default branch, "push to main"), change to `develop`. Preserve historical references in changelogs and past spec docs (those are point-in-time and shouldn't be rewritten).

If the README does not exist or is empty on this concern, skip with a note in the commit message.

- [ ] **Step 3: Verify no operational `main` references remain in README**

Run: `grep -nE '\b(push to main|deploys? from main|merge to main)\b' README.md`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/pull_request_template.md
git commit -m "docs: update operational trunk references from main to develop

Historical references in past spec docs and changelogs are preserved
(point-in-time, not retroactively rewritten)."
```

---

## Task 5: Push story branch and prepare for trunk rename

**Files:**
- No file changes.

- [ ] **Step 1: Push story branch**

Run: `git push origin feature_1/story_1`

- [ ] **Step 2: Open a PR (story → feature_1/main) and self-merge once green**

Run:
```bash
gh pr create --base feature_1/main --head feature_1/story_1 \
  --title "feature_1/story_1: repo + process baseline" \
  --body "$(cat <<'EOF'
## Summary
- Adds eTech PR template
- Restructures CI to gate Pages deploy on releases/v* branches
- Updates operational README references main → develop

## Related
- Feature 1 (eTech Standards Adoption)
- Story 1 (Repo/Process Baseline)
- Spec: docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md

## Test plan
- [ ] All four gating CI jobs green on this PR
- [ ] YAML validates locally
- [ ] PR template renders correctly in this very PR
EOF
)"
```

Wait for the four gating jobs (`build`, `e2e-export`, `unit-test`, `lint`) to pass. Do NOT merge yet — the trunk rename comes first, then the merge follows.

- [ ] **Step 3: Confirm CI green**

Run: `gh pr checks $(gh pr view --json number -q .number)`
Expected: all four jobs PASS.

---

## Task 6: Rename remote default branch main → develop

**Files:**
- No file changes; GitHub repo settings + git operations.

This is the irreversible-feeling step. Read all sub-steps before executing.

- [ ] **Step 1: Push current main as develop on remote**

Run:
```bash
git checkout main
git pull --ff-only origin main
git branch develop main
git push origin develop
```

- [ ] **Step 2: Change repo default branch on GitHub**

Run: `gh api -X PATCH repos/NickCason/e-OIC -f default_branch=develop`

Verify:
```bash
gh api repos/NickCason/e-OIC -q .default_branch
```
Expected: `develop`.

- [ ] **Step 3: Update GitHub Pages source**

GitHub Pages on this repo currently builds via the Pages action artifact uploaded by the workflow (not from a branch directly). Confirm:
```bash
gh api repos/NickCason/e-OIC/pages -q '.source.branch'
```
If the response is `null` or empty, Pages uses GitHub Actions deployment (the `actions/deploy-pages@v4` step) — no Pages-side source change is needed; the workflow's branch filter is what controls deploy.

If the response is `main`, switch to `develop`:
```bash
gh api -X PUT repos/NickCason/e-OIC/pages -f source.branch=develop -f source.path=/
```

- [ ] **Step 4: Update local default tracking**

```bash
git remote set-head origin develop
git fetch origin
```

- [ ] **Step 5: Delete old main on remote**

Only after confirming `develop` is the default and Pages is reconfigured.

```bash
gh api -X DELETE repos/NickCason/e-OIC/git/refs/heads/main
```

Verify:
```bash
git ls-remote --heads origin main
```
Expected: empty (no `refs/heads/main`).

- [ ] **Step 6: Commit nothing locally; just record the change**

This task has no commit. Document in the merge commit when story_1 merges to feature_1/main.

---

## Task 7: Re-target the open PR to develop and merge story_1 → feature_1/main

**Files:**
- No file changes.

- [ ] **Step 1: Re-target the feature_1/main branch base if needed**

Since feature_1/main was cut from old main (which is now identical to develop), no rebase is needed. Confirm:
```bash
git fetch origin
git log feature_1/main..origin/develop --oneline
```
Expected: empty (feature_1/main and develop are identical at this point).

- [ ] **Step 2: Merge story_1 PR into feature_1/main**

```bash
gh pr merge $(gh pr view --json number -q .number) --merge --delete-branch=false
```

Use a merge commit (not squash) to preserve the story-by-story history per trunk-based development convention.

- [ ] **Step 3: Update local feature_1/main**

```bash
git checkout feature_1/main
git pull --ff-only origin feature_1/main
```

---

## Task 8: Verification — agent-side automated + hands-on

**Files:**
- No file changes; verification commands only.

- [ ] **Step 1: Automated suite on feature_1/main**

Run each and confirm green:
```bash
npm ci
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```
Expected: all five exit 0.

- [ ] **Step 2: Cut a test patch release branch from develop**

```bash
git checkout develop
git pull --ff-only origin develop
CURRENT=$(node -p "require('./version.json').version")
NEXT_PATCH=$(node -p "const [a,b,c]=require('./version.json').version.split('.'); \`\${a}.\${b}.\${Number(c)+1}\`")
echo "Current: $CURRENT  Next patch: $NEXT_PATCH"
git checkout -b "releases/v$NEXT_PATCH"
node -e "const fs=require('fs'); const v=require('./version.json'); v.version='$NEXT_PATCH'; fs.writeFileSync('./version.json', JSON.stringify(v)+'\n');"
git add version.json
git commit -m "release: v$NEXT_PATCH (CI deploy-path verification)"
git push -u origin "releases/v$NEXT_PATCH"
```

- [ ] **Step 3: Confirm Pages deploys from the release branch**

Wait for the workflow run on `releases/v<NEXT_PATCH>` to complete.

```bash
gh run watch
```

Expected: all four gating jobs + `deploy` job succeed. The deploy URL appears in the run summary.

Then visit the deployed Pages URL and confirm:
- The app loads.
- The footer/about screen shows version `v<NEXT_PATCH>`.
- No console errors.

- [ ] **Step 4: Confirm pushes to develop do NOT deploy**

```bash
git checkout develop
echo "" >> README.md  # add a trailing newline so develop has a new commit
git add README.md
git commit -m "chore: trigger develop CI to verify no-deploy"
git push origin develop
gh run watch
```
Expected: build, e2e-export, unit-test, lint jobs succeed; `deploy` job is skipped (the `if: startsWith(github.ref, 'refs/heads/releases/v')` guard).

If `deploy` runs on develop, the workflow is broken — fix the `if` condition before proceeding.

- [ ] **Step 5: Hands-on smoke (Tailscale preview)**

```bash
npm run build
npm run preview -- --host &
PREVIEW_PID=$!
sleep 3
tailscale serve --bg https+insecure://localhost:4173
tailscale serve status
```

Post the resulting Tailscale URL. User tests the deployed app on a real device.

Stop preview after handoff:
```bash
kill $PREVIEW_PID
tailscale serve reset
```

- [ ] **Step 6: Produce confidence rating**

Output exactly this format (filling in real values):

```
Confidence: NN%
Automated: lint ✅ | tsc ⏭ (no TS yet) | unit (n/n) ✅ | e2e ✅ | build ✅
Hands-on:
- Deploy from releases/v<NEXT_PATCH> succeeded; app loads at Pages URL.
- Push to develop did NOT trigger deploy.
- Pages version stamp correct.
- PR template renders on PRs.
- README operational references read "develop".
Known gaps/risks: <list or "none">
Tailscale URL: https://...
```

If confidence < 95%, fix and re-test before handing off.

---

## Task 9: Save memory + update downstream plan files

This is the **last step of Plan A**. It exists so the user can `/clear` context cleanly before launching Plan B's subagent.

**Files:**
- Create: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic_etech_migration.md` (or update if it already exists from a prior plan run)
- Modify: `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/MEMORY.md`
- Modify: `docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md`

- [ ] **Step 1: Capture the merge SHA**

```bash
PLAN_A_MERGE_SHA=$(git rev-parse feature_1/main)
echo "Plan A merge SHA: $PLAN_A_MERGE_SHA"
```

- [ ] **Step 2: Write the migration-status memory**

Write `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/project_eoic_etech_migration.md`:

```markdown
---
name: e-OIC eTech standards migration status
description: Tracks progress of the eTech standards + TS-strict big-bang migration (feature_1)
type: project
---

**Feature:** feature_1 (eTech Coding Standards adoption + TS strict)
**Spec:** docs/superpowers/specs/2026-05-12-etech-standards-and-typescript-strict-design.md
**Long-lived branch:** feature_1/main

**Plan status:**
- [x] Plan A — Repo/process baseline. Merge SHA: <PLAN_A_MERGE_SHA>. Completed YYYY-MM-DD.
- [ ] Plan B — TS scaffolding + tooling. File: docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md
- [ ] Plan C — Lib + exporter conversion. File: docs/superpowers/plans/2026-05-12-etech-standards-plan-c-lib-exporter.md
- [ ] Plan D — Components + scripts + final release. File: docs/superpowers/plans/2026-05-12-etech-standards-plan-d-components-scripts.md

**Decisions locked in:**
- Trunk: develop (main deleted on remote).
- Deploys: releases/v* only.
- Test release verified at releases/v<NEXT_PATCH>.
- PR template at .github/pull_request_template.md (ported from C# template).
- CI workflow: .github/workflows/deploy.yml — gates run on develop + feature_*/**; deploy guarded by `if: startsWith(github.ref, 'refs/heads/releases/v')`.

**How to apply:** When starting Plan B, branch `feature_1/story_2` from `feature_1/main` (NOT from develop, since feature_1/main is the integration branch for the migration). Plan B installs TS tooling but does not rename files.
```

Substitute `<PLAN_A_MERGE_SHA>` with the real SHA from Step 1 and `YYYY-MM-DD` with today's date.

- [ ] **Step 3: Add the memory to the index**

Append to `/Users/nickcason/.claude/projects/-Users-nickcason-DevSpace-Work/memory/MEMORY.md`:

```
- [e-OIC eTech standards migration status](project_eoic_etech_migration.md) — feature_1 big-bang: TS strict + standards adoption. Plan A done; Plan B next.
```

If the line already exists from a prior run, update the trailing hook to reflect Plan A done.

- [ ] **Step 4: Update Plan B's "Prerequisites verified" section**

Open `docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md`. In its "Prerequisites verified" block, mark the items that Plan A satisfied and record the Plan A merge SHA. Specifically check:
- [x] `develop` is the remote default branch
- [x] `feature_1/main` exists on remote at SHA `<PLAN_A_MERGE_SHA>`
- [x] CI workflow `.github/workflows/deploy.yml` gates deploy on `releases/v*`
- [x] `.github/pull_request_template.md` present
- [x] Plan A merge SHA recorded: `<PLAN_A_MERGE_SHA>`

- [ ] **Step 5: Commit memory + downstream-plan update**

The memory file is outside the repo and doesn't get committed. The Plan B file edit gets committed on `feature_1/story_1` and rolled into the merge.

Wait — Plan A's PR is already merged. The Plan B file update must go on a tiny follow-up branch:

```bash
git checkout feature_1/main
git pull --ff-only origin feature_1/main
git checkout -b feature_1/story_1-handoff
git add docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md
git commit -m "chore(plan-handoff): mark Plan A prerequisites complete in Plan B"
git push -u origin feature_1/story_1-handoff
gh pr create --base feature_1/main --head feature_1/story_1-handoff \
  --title "Plan A → Plan B handoff" \
  --body "Records Plan A merge SHA in Plan B prerequisites."
gh pr merge --merge --delete-branch
git checkout feature_1/main && git pull --ff-only origin feature_1/main
```

- [ ] **Step 6: Final handoff message**

Post:

```
✅ Plan A complete.

Confidence: NN%
Plan A merge SHA: <PLAN_A_MERGE_SHA>
Test release: releases/v<NEXT_PATCH>
Default branch: develop
Pages deploy: gated on releases/v*

Memory written: project_eoic_etech_migration.md
Next plan: docs/superpowers/plans/2026-05-12-etech-standards-plan-b-ts-scaffolding.md

Safe to /clear context. Plan B subagent should branch feature_1/story_2 from feature_1/main.
```

---

## Self-Review Checklist (run before declaring plan complete)

- [ ] Every step has either a file path + exact code, or an exact command + expected output.
- [ ] No "TODO", "TBD", "implement later" language.
- [ ] Branch names match the spec exactly: `feature_1/main`, `feature_1/story_1`, `releases/v*`, `develop`.
- [ ] Verification block in Task 8 covers automated suite + hands-on deploy-path + Tailscale + confidence rating.
- [ ] Task 9 saves memory and updates Plan B's prerequisites section.
