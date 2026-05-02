import React, { useEffect, useState } from 'react';

// Reusable horizontal percentage bar. Honors prefers-reduced-motion.
//
// Props:
//   percent      0..100 (clamped)
//   height       px
//   trackColor   CSS color for the unfilled track (defaults to var(--bg-3))
//   fillColor    CSS color for the fill (defaults to var(--accent))
//   accentColor  CSS color used when percent === 100 (defaults to var(--energy))
//   className    extra class on the root <div>
//   ariaLabel    a11y label for screen readers
export default function PercentBar({
  percent = 0,
  height = 6,
  trackColor = 'var(--bg-3)',
  fillColor = 'var(--accent)',
  accentColor = 'var(--energy)',
  className = '',
  ariaLabel,
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Draw on mount: 0 -> pct on next frame so it fills in lockstep with CountUp.
  const [animatedPct, setAnimatedPct] = useState(reduced ? pct : 0);
  useEffect(() => {
    if (reduced) { setAnimatedPct(pct); return; }
    const raf = requestAnimationFrame(() => setAnimatedPct(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct, reduced]);

  return (
    <div
      className={`percent-bar ${className}`.trim()}
      style={{ background: trackColor, height, borderRadius: height, overflow: 'hidden' }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={ariaLabel || `${pct} percent complete`}
    >
      <div
        className="percent-bar__fill"
        style={{
          width: `${animatedPct}%`,
          height: '100%',
          background: pct === 100 ? accentColor : fillColor,
          borderRadius: height,
          transition: reduced ? undefined : 'width 600ms cubic-bezier(0.22, 1, 0.36, 1), background 200ms ease',
        }}
      />
    </div>
  );
}
