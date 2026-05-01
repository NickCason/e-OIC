# iOS Keyboard Overlay Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the iOS on-screen keyboard from covering focused text/numeric input fields in the e-OIC PWA (installed standalone on iPhone).

**Architecture:** A `visualViewport`-driven `--keyboard-inset` CSS variable updated by a single React hook mounted at the App root. All bottom-anchored UI (`.savebar`, `.toast-host`, `.fab`, the form's `padding-bottom`) consumes the variable so it lifts above the keyboard. A delegated `focusin` handler scrolls focused inputs into the visible band via `scrollIntoView({ block: 'center' })`.

**Tech Stack:** React 18, Vite 5, vanilla CSS custom properties, browser `window.visualViewport` API. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-30-keyboard-overlay-fix-design.md`

**Workflow notes (e-OIC):**
- Direct-on-`main`. No worktree, no PR.
- Each task ends with `git add <files> && git commit -m "<message>"` on `main`.
- Final task pushes to `origin/main`. GitHub Actions handles the Pages deploy.
- This change has no automated test value (per spec). Verification is `npm run build` passing for each commit and a real-device QA pass at the end.

---

### Task 1: Create the `useKeyboardInset` hook + focus scroll handler

**Files:**
- Create: `src/lib/useKeyboardInset.js`

- [ ] **Step 1: Create the file with the full hook implementation**

Write `src/lib/useKeyboardInset.js`:

```javascript
// Tracks the iOS virtual-keyboard inset and exposes it as the CSS custom
// property --keyboard-inset on <html>. Also scrolls focused inputs into
// the visible band so they aren't obscured by the keyboard.
//
// Mount once at the top of <App />. No props, no return value.
//
// Why a CSS variable: .savebar, main padding, .toast-host, and .fab all
// need to react to the same value. A custom property on :root lets every
// consumer pick it up via plain CSS without prop drilling or extra renders.
//
// On iOS, focusing the keyboard does NOT shrink the layout viewport — it
// shrinks the *visual* viewport. window.visualViewport reports the visible
// region; the difference between layout-viewport height and visual-viewport
// (height + offsetTop) is the keyboard's pixel inset.

import { useEffect } from 'react';

const FOCUS_SCROLL_DELAY_MS = 50;

export default function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;

    // Bail on browsers without visualViewport. --keyboard-inset stays unset,
    // so CSS var(--keyboard-inset, 0) falls back to 0 — current behavior.
    if (!vv) return undefined;

    let rafId = 0;
    const writeInset = () => {
      rafId = 0;
      const layoutH = window.innerHeight;
      const visibleBottom = vv.height + vv.offsetTop;
      const inset = Math.max(0, Math.round(layoutH - visibleBottom));
      root.style.setProperty('--keyboard-inset', `${inset}px`);
    };
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(writeInset);
    };

    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);

    const onFocusIn = (e) => {
      const t = e.target;
      if (!t) return;
      const tag = t.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
      if (!editable) return;
      // Defer so iOS has time to start the keyboard animation and update
      // visualViewport before the browser measures for scrollIntoView.
      setTimeout(() => {
        if (typeof t.scrollIntoView === 'function') {
          t.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, FOCUS_SCROLL_DELAY_MS);
    };
    document.addEventListener('focusin', onFocusIn);

    writeInset();

    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', onFocusIn);
      if (rafId) cancelAnimationFrame(rafId);
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);
}
```

- [ ] **Step 2: Verify the file parses and the build still succeeds**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors. Hook is not yet imported anywhere, so it just sits in the source tree.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useKeyboardInset.js
git commit -m "feat(ui): add useKeyboardInset hook for iOS keyboard overlay"
```

---

### Task 2: Mount the hook in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import**

In `src/App.jsx`, add this import alongside the other lib imports (after line 10, the `seed.js` import):

```javascript
import useKeyboardInset from './lib/useKeyboardInset.js';
```

- [ ] **Step 2: Call the hook inside `App()`**

Inside `export default function App() { ... }`, add the call as the very first line of the component body (before the existing `useState` calls):

```javascript
  useKeyboardInset();
```

The body should begin like:

```javascript
export default function App() {
  useKeyboardInset();
  const [route, setRoute] = useState(parseHash());
  const [showGeoPrompt, setShowGeoPrompt] = useState(false);
  // ...rest unchanged
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Sanity-check in the browser**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run dev`
In a desktop browser DevTools console: `getComputedStyle(document.documentElement).getPropertyValue('--keyboard-inset')`
Expected: `"0px"` (or empty before the first effect tick — but no errors and no console warnings). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(ui): mount useKeyboardInset at App root"
```

---

### Task 3: Lift `.savebar` above the keyboard

**Files:**
- Modify: `src/styles.css` (lines 580–597, the `.savebar` rule)

- [ ] **Step 1: Update the `.savebar` rule**

Find this block in `src/styles.css` starting around line 580:

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
```

Replace it with:

```css
/* SaveBar (sticky save & next) */
.savebar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--keyboard-inset, 0);
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
  transition: bottom 180ms ease-out;
}
```

(The two changes are: `bottom: 0` → `bottom: var(--keyboard-inset, 0);` and a new `transition: bottom 180ms ease-out;` line at the end.)

- [ ] **Step 2: Verify the build**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "fix(ui): savebar lifts above iOS keyboard via --keyboard-inset"
```

---

### Task 4: Adjust `main` form padding for the keyboard inset

**Files:**
- Modify: `src/styles.css` (line 192)

- [ ] **Step 1: Update the `main` rule's padding-bottom**

Find this block in `src/styles.css` around line 189–196:

```css
main {
  flex: 1;
  padding: var(--sp-3);
  padding-bottom: 110px; /* room for SaveBar + safe area */
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}
```

Replace the `padding-bottom` line:

```css
main {
  flex: 1;
  padding: var(--sp-3);
  padding-bottom: calc(110px + var(--keyboard-inset, 0px)); /* room for SaveBar + safe area + keyboard */
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}
```

- [ ] **Step 2: Verify the build**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "fix(ui): main padding-bottom grows with --keyboard-inset"
```

---

### Task 5: Lift `.toast-host` and `.fab`

**Files:**
- Modify: `src/styles.css` (lines ~1158–1161 and ~1351–1352)

- [ ] **Step 1: Update `.toast-host`**

Find this block (around line 1157–1170):

```css
/* Toast */
.toast-host {
  position: fixed;
  bottom: 110px;
  left: 50%;
  transform: translateX(-50%);
```

Change `bottom: 110px;` to:

```css
  bottom: calc(110px + var(--keyboard-inset, 0px));
```

So the rule begins:

```css
/* Toast */
.toast-host {
  position: fixed;
  bottom: calc(110px + var(--keyboard-inset, 0px));
  left: 50%;
  transform: translateX(-50%);
```

(Rest of the `.toast-host` rule is unchanged.)

- [ ] **Step 2: Update `.fab`**

Find this block (around line 1351–1352):

```css
.fab {
  position: fixed; right: 18px; bottom: max(20px, env(safe-area-inset-bottom));
```

Change the `bottom:` to:

```css
.fab {
  position: fixed; right: 18px; bottom: calc(max(20px, env(safe-area-inset-bottom)) + var(--keyboard-inset, 0px));
```

(Rest of the `.fab` rule is unchanged.)

- [ ] **Step 3: Verify the build**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "fix(ui): toast-host and fab lift above keyboard"
```

---

### Task 6: Add input scroll-margin safety net

**Files:**
- Modify: `src/styles.css` (append a new block near other element-level rules; suggested location: just before `/* === components === */` at line 198)

- [ ] **Step 1: Insert the rule**

After the `main { ... }` rule (the one ending around line 196) and before the `/* === components === */` comment at line 198, insert:

```css
/* Keep focused inputs visually centered above keyboard + AppBar */
input,
textarea,
[contenteditable] {
  scroll-margin-top: 80px;
  scroll-margin-bottom: 24px;
}
```

- [ ] **Step 2: Verify the build**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "fix(ui): scroll-margin on inputs for centered focus scroll"
```

---

### Task 7: Bump version to v24

**Files:**
- Modify: `src/version.js`
- Modify: `public/service-worker.js`

- [ ] **Step 1: Update `src/version.js`**

Change line 5 from:

```javascript
export const BUILD_VERSION = 'v23';
```

to:

```javascript
export const BUILD_VERSION = 'v24';
```

- [ ] **Step 2: Update `public/service-worker.js`**

Change line 3 from:

```javascript
const VERSION = 'v23';
```

to:

```javascript
const VERSION = 'v24';
```

- [ ] **Step 3: Verify the build**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/version.js public/service-worker.js
git commit -m "chore(release): v24"
```

---

### Task 8: Push to deploy

**Files:** none

- [ ] **Step 1: Confirm working tree is clean**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && git status`
Expected: `nothing to commit, working tree clean`. If anything is uncommitted, stop and surface it.

- [ ] **Step 2: Confirm branch is `main`**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && git rev-parse --abbrev-ref HEAD`
Expected: `main`. If not, stop and surface it.

- [ ] **Step 3: Push**

Run: `cd /Users/nickcason/DevSpace/Work/e-OIC && git push origin main`
Expected: push succeeds. GitHub Actions will deploy to Pages and upload the sample-export artifact.

- [ ] **Step 4: Surface the deploy URL**

Output to the user: "v24 pushed to main. GitHub Actions is deploying to Pages."

---

### Task 9: Manual real-device QA (handoff to user)

This task is performed by the user, not the agent. After Task 8 completes, surface the QA checklist below and stop.

**QA checklist (iPhone, e-OIC PWA installed to Home Screen, standalone):**

- [ ] Open the PWA. Settings → About should show **v24**.
- [ ] Open a job → panel → form. Tap an input near the **top** of the form. Confirm: field is centered in view, SaveBar sits just above the keyboard.
- [ ] Tap an input in the **middle** of the form. Confirm same.
- [ ] Tap the **bottom-most** input row of a long form. Confirm the field is fully visible above the keyboard and SaveBar.
- [ ] While the keyboard is still open, tap **"Save & next row"**. Confirm it triggers the save and advances the row without dismissing the keyboard.
- [ ] Rotate to landscape mid-edit. Confirm SaveBar and inputs reflow to landscape; focused input remains visible.
- [ ] Pair a Bluetooth keyboard, focus an input. Confirm: no layout shift; SaveBar stays at the bottom.
- [ ] (Optional, if iPad available) Test with floating keyboard — SaveBar should stay anchored at the bottom (correct behavior, since floating keyboard doesn't occlude the bottom).
- [ ] Numeric input (decimal pad) — same checks.

If any check fails, file a follow-up before declaring v24 successful.

---

## Self-review notes

- **Spec coverage:** every spec section maps to a task — hook (Task 1), App mount (Task 2), `.savebar` (Task 3), `main` padding (Task 4), `.toast-host` + `.fab` (Task 5), input scroll-margin (Task 6), version bump (Task 7), deploy (Task 8), QA (Task 9).
- **No placeholders:** every code step shows the exact code; every CSS step shows the exact replacement; every command shows the exact path.
- **Type/name consistency:** the CSS variable is `--keyboard-inset` everywhere; the hook is `useKeyboardInset` (default export) everywhere; the focus delay constant is `FOCUS_SCROLL_DELAY_MS = 50`.
- **TDD note:** the spec explicitly excludes automated tests for this work because Vitest/Playwright cannot meaningfully simulate iOS virtual-keyboard behavior. Per-task verification is `npm run build` plus end-of-plan real-device QA. This is an intentional deviation from default TDD discipline, justified in the spec.
