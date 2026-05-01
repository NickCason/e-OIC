# iOS Keyboard Overlay Fix — Design

**Date:** 2026-04-30
**Status:** Draft
**Target version:** v24

## Problem

In the e-OIC PWA installed to the iOS Home Screen (standalone mode), focusing a text or numeric input near the bottom of `SheetForm` causes the on-screen keyboard to cover the input. The user cannot see what they are typing.

## Root cause

iOS Safari does not shrink the layout viewport when the virtual keyboard opens; it shrinks the *visual* viewport instead. Two consequences:

1. `SaveBar` is `position: fixed; bottom: 0`, so it stays anchored to the bottom of the *layout* viewport — which is now hidden behind the keyboard. iOS's native scroll-into-view places the focused input just above the keyboard's top edge, where the SaveBar is still being painted. The SaveBar plus the keyboard together obscure the input.
2. The form (`main`) reserves only `padding-bottom: 110px` for the SaveBar. With the keyboard open, the last few rows of a long form cannot scroll high enough to clear both the keyboard and the SaveBar.

## Goal

Keep the focused input fully visible while typing, on iOS PWA standalone, without regressing other platforms or breaking the "Save & next row" demo flow.

## Non-goals

- Fixing the export dialog or lightbox modal layouts (no inputs that need this treatment today).
- Adding visualViewport handling to Safari browser tabs specifically — the same code will benefit them, but the test target is installed PWA.
- Automated tests for keyboard behavior (real-device QA only — see Testing).

## Approach

A `visualViewport`-driven CSS variable, `--keyboard-inset`, that all bottom-anchored UI consumes. A delegated focus handler scrolls focused inputs into the visible band. No new components, no library dependencies.

### 1. Hook: `src/lib/useKeyboardInset.js`

A React hook that:

- Subscribes to `window.visualViewport` `resize` and `scroll` events.
- On each event, computes:
  ```
  inset = layoutViewportHeight - (visualViewport.height + visualViewport.offsetTop)
  ```
  Clamped to `>= 0`. When the keyboard is closed this is ~0; when open it is the pixel height the keyboard occupies inside the layout viewport.
- Writes the value to `document.documentElement.style` as `--keyboard-inset` in `px`, batched via `requestAnimationFrame` to avoid thrashing during the keyboard-open animation.
- Cleans up listeners on unmount.
- No-ops if `window.visualViewport` is undefined (older non-iOS browsers) — `--keyboard-inset` defaults to `0`, current behavior preserved.

Mounted once at the top of `App.jsx`. Side-effect-only; returns nothing.

### 2. Focus scroll handler

Co-located with the hook (same module or sibling in `src/lib/`):

- Single delegated `focusin` listener on `document`.
- On `focusin` whose target is an `<input>`, `<textarea>`, or `[contenteditable]`:
  - `setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)`
  - The 50 ms delay lets iOS start its keyboard animation and update `visualViewport` before measurement.
- `block: 'center'` (not `'nearest'`) puts the focused field comfortably in the middle of the visible band, with breathing room above and below the keyboard + elevated SaveBar.

### 3. CSS changes (`src/styles.css`)

**`SaveBar` rides above the keyboard** (line ~582):

```css
.savebar {
  position: fixed;
  bottom: var(--keyboard-inset, 0);
  /* existing left/right/height/etc. unchanged */
  transition: bottom 180ms ease-out;
}
```

**Form scroll area reserves dynamic space** (line 192):

```css
main {
  padding-bottom: calc(110px + var(--keyboard-inset, 0px));
}
```

**Other fixed-bottom elements** at lines 678 and 696 (currently `bottom: max(var(--sp-4), env(safe-area-inset-bottom))`):

```css
bottom: calc(max(var(--sp-4), env(safe-area-inset-bottom)) + var(--keyboard-inset, 0px));
```

**Scroll-margin safety net** for inputs:

```css
input, textarea, [contenteditable] {
  scroll-margin-top: 80px;     /* clear AppBar */
  scroll-margin-bottom: 24px;  /* gap above SaveBar */
}
```

`AppBar` (sticky top) is unchanged — keyboard does not affect it.

## Edge cases

- **Hardware / Bluetooth keyboard:** `visualViewport.height` equals layout viewport height → inset stays `0` → no shifts. Correct automatically.
- **Orientation change:** `visualViewport` fires `resize` → hook recomputes → SaveBar and inset adjust. No special handling.
- **iPad floating / split keyboard:** iOS reports `0` keyboard inset for floating keyboards; SaveBar stays at the bottom, which is correct since the floating keyboard does not occlude the bottom of the screen.
- **Keyboard dismissal:** `visualViewport` fires `resize` on collapse → inset returns to `0` → SaveBar smoothly transitions back via the 180 ms `bottom` transition.
- **Missing `visualViewport`:** Hook is a no-op; `--keyboard-inset` defaults to `0`; behavior identical to today.

## Side benefit

With SaveBar elevated above the keyboard, "Save & next row" becomes tappable *while the keyboard is still open*. This makes data entry meaningfully faster — the user can complete a row, tap Save & Next, type the next row, repeat, all without dismissing the keyboard between rows.

## Testing

Real-device QA on installed PWA (iPhone Home Screen, standalone). The Vitest/Playwright stack cannot meaningfully simulate iOS virtual keyboard behavior — automated tests would prove nothing and are explicitly out of scope.

QA checklist:

- Tap inputs at top, middle, and **bottom-most row** of a long form. Each must end up visually centered with the SaveBar resting just above the keyboard.
- Tap **Save & next row while the keyboard is still open**. Confirm it triggers and advances without keyboard dismissal.
- Rotate to landscape mid-edit. SaveBar and inputs reflow correctly.
- Connect a Bluetooth keyboard. `--keyboard-inset` stays `0`; nothing shifts.
- iPad with floating/split keyboard. SaveBar stays anchored at the bottom (correct).
- iPad with docked keyboard. Behaves like iPhone case.

## Rollout

- Bump `src/version.js` `BUILD_VERSION` and `public/service-worker.js` `VERSION` to v24 in lockstep.
- Push to `main`. GitHub Actions auto-deploys to Pages.
- No feature flag. No staged rollout. The change is additive: CSS variable defaults to `0` on every platform without `visualViewport` or with the keyboard closed, so existing behavior is preserved.

## Risk

Very low.

- Non-iOS users: hook is a no-op; CSS uses `var(--keyboard-inset, 0)` defaults.
- Hardware-keyboard sessions: inset stays `0`; no behavioral change.
- If `visualViewport` returns slightly wrong values on a future iOS release, the worst-case visual outcome is an input scrolling slightly off-center — strictly no worse than today.

## Files touched

- `src/App.jsx` — mount the hook once.
- `src/lib/useKeyboardInset.js` — new file (hook + focus handler).
- `src/styles.css` — `.savebar`, `main`, two other fixed-bottom rules (lines 678, 696), input scroll-margin block.
- `src/version.js`, `public/service-worker.js` — v24 bump.
