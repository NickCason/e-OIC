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

  const baseFill = pct === 100 ? accentColor : fillColor;
  // Two backgrounds on the fill: dark diagonal stripes on top, base color
  // beneath. backgroundSize on the gradient makes the stripe period
  // explicit so the keyframe knows how far to translate. Stripes live on
  // the fill itself instead of an overlay child so no absolute-positioned
  // sibling can be lost on iOS.
  const stripeBg = `repeating-linear-gradient(-45deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 5px, transparent 5px, transparent 10px), ${baseFill}`;

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
        className={`percent-bar__fill${pct > 0 ? ' is-shimmering' : ''}`}
        style={{
          width: `${animatedPct}%`,
          height: '100%',
          background: stripeBg,
          borderRadius: height,
          transition: reduced ? undefined : 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}
