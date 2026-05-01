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
