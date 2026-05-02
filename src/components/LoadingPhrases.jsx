import React, { useEffect, useRef, useState } from 'react';
import { pickPhrase } from '../lib/loadingPhrases.js';

// Typewriter-style phrase rotation. The current phrase backspaces to
// empty, then the next phrase types in character by character.
//
// Phases:
//   'type' — appending one character per TYPE_MS until shown === target
//   'hold' — fully shown; caret blinks; lasts HOLD_MS
//   'back' — removing one character per BACK_MS until shown === ''
//   then picks a new target and returns to 'type'
//
// On mount: shown starts empty and types in the first phrase, so the
// loader's debut feels deliberate rather than flashing in fully formed.
//
// Honors prefers-reduced-motion: just swaps full text on an interval
// with no character-level animation.

const TYPE_MS = 32;     // ms per character typing in
const BACK_MS = 18;     // ms per character backspacing (faster)
const HOLD_MS = 1100;   // ms the full phrase sits before backspacing

const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function LoadingPhrases({ set = 'general', className = '' }) {
  const [target, setTarget] = useState(() => pickPhrase(set));
  const [shown, setShown] = useState(REDUCED ? () => target : '');
  const [phase, setPhase] = useState(REDUCED ? 'hold' : 'type');
  const recentRef = useRef([target]);

  useEffect(() => {
    if (REDUCED) {
      const id = setInterval(() => {
        const next = pickPhrase(set, recentRef.current);
        recentRef.current = [next, ...recentRef.current].slice(0, 6);
        setTarget(next);
        setShown(next);
      }, HOLD_MS + 600);
      return () => clearInterval(id);
    }

    let timer;
    if (phase === 'hold') {
      timer = setTimeout(() => setPhase('back'), HOLD_MS);
    } else if (phase === 'back') {
      if (shown.length === 0) {
        const next = pickPhrase(set, recentRef.current);
        recentRef.current = [next, ...recentRef.current].slice(0, 6);
        setTarget(next);
        setPhase('type');
      } else {
        timer = setTimeout(() => setShown((s) => s.slice(0, -1)), BACK_MS);
      }
    } else if (phase === 'type') {
      if (shown.length === target.length) {
        setPhase('hold');
      } else {
        timer = setTimeout(
          () => setShown(target.slice(0, shown.length + 1)),
          TYPE_MS,
        );
      }
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [phase, shown, target, set]);

  return (
    <div className={`loading-phrase ${className}`.trim()}>
      <span className="loading-phrase__text">{shown}</span>
      <span
        className={`loading-phrase__caret${phase === 'hold' ? ' is-blinking' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
}
