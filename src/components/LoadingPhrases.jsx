import React, { useEffect, useRef, useState } from 'react';
import { pickPhrase } from '../lib/loadingPhrases.js';

// Cycles a random selection from a context-specific phrase library
// (set: 'export'|'parse'|'diff'|'apply'|'build'|'photo'|'general')
// at a fixed interval. Each phrase gets its own React key so it
// remounts and re-runs the CSS fade-in. Avoids repeats within the
// last 6 picks.

const PHRASE_MS = 1800;

export default function LoadingPhrases({ set = 'general', className = '', intervalMs = PHRASE_MS }) {
  const [phrase, setPhrase] = useState(() => pickPhrase(set));
  const recentRef = useRef([phrase]);

  useEffect(() => {
    const id = setInterval(() => {
      const next = pickPhrase(set, recentRef.current);
      recentRef.current = [next, ...recentRef.current].slice(0, 6);
      setPhrase(next);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, set]);

  return (
    <div className={`loading-phrase ${className}`.trim()} key={phrase}>
      {phrase}
    </div>
  );
}
