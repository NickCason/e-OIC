import React, { useEffect, useState } from 'react';

// Reusable horizontal percentage bar. Honors prefers-reduced-motion.
// Track + fill + shimmer colors live entirely in CSS so they adapt to
// [data-theme="light"] / [data-theme="dark"] without prop plumbing.
//
// Props:
//   percent      0..100 (clamped)
//   height       px
//   className    extra class on the root <div>
//   ariaLabel    a11y label for screen readers
export default function PercentBar({
  percent = 0,
  height = 6,
  className = '',
  ariaLabel,
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Draw on mount: 0 -> pct on next frame so the fill animates in lockstep
  // with CountUp.
  const [animatedPct, setAnimatedPct] = useState(reduced ? pct : 0);
  useEffect(() => {
    if (reduced) { setAnimatedPct(pct); return; }
    const raf = requestAnimationFrame(() => setAnimatedPct(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct, reduced]);

  return (
    <div
      className={`percent-bar ${className}`.trim()}
      style={{ height, borderRadius: height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={ariaLabel || `${pct} percent complete`}
    >
      <div
        className={`percent-bar__fill${pct === 100 ? ' is-complete' : ''}${pct > 0 ? ' is-shimmering' : ''}`}
        style={{
          width: `${animatedPct}%`,
          height: '100%',
          borderRadius: height,
          transition: reduced ? undefined : 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}
