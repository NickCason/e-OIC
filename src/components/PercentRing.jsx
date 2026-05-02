import React, { useEffect, useState } from 'react';

// Reusable SVG percentage ring. Honors prefers-reduced-motion (no transition).
//
// Props:
//   percent      0..100 (clamped)
//   size         px (outer diameter)
//   stroke       px (arc thickness)
//   trackColor   CSS color for the unfilled track (defaults to var(--bg-3))
//   arcColor     CSS color for the filled arc (defaults to var(--accent))
//   accentColor  CSS color used when percent === 100 (defaults to var(--energy))
//   children     centered content (e.g. monogram letters or "%" text)
//   className    extra class on the root <div>
//   ariaLabel    a11y label for screen readers
export default function PercentRing({
  percent = 0,
  size = 56,
  stroke = 5,
  trackColor = 'var(--bg-3)',
  arcColor = 'var(--accent)',
  accentColor = 'var(--energy)',
  children,
  className = '',
  ariaLabel,
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);
  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const stroked = pct === 100 ? accentColor : arcColor;

  // Draw on mount: start at 0% (full dashOffset), transition to actual on
  // next frame so the ring sweeps in lockstep with the CountUp number.
  // Subsequent percent changes also animate via the same transition.
  const [animatedOffset, setAnimatedOffset] = useState(reduced ? dashOffset : circumference);
  useEffect(() => {
    if (reduced) {
      setAnimatedOffset(dashOffset);
      return;
    }
    const raf = requestAnimationFrame(() => setAnimatedOffset(dashOffset));
    return () => cancelAnimationFrame(raf);
  }, [dashOffset, reduced]);
  return (
    <div
      className={`percent-ring ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel || `${pct} percent complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroked}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={animatedOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={reduced ? undefined : { transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1), stroke 200ms ease' }}
        />
      </svg>
      {children != null && <div className="percent-ring__center">{children}</div>}
    </div>
  );
}
