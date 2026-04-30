import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Smooth horizontal marquee for text that would otherwise truncate.
// Measures the inner text against the container and only animates when
// the inner is wider — short labels stay still.
//
// Animation uses an ease-in-out cubic-bezier so the scroll accelerates
// from rest, holds at each end, and decelerates back. Loops indefinitely.
//
// Props:
//   children: string | ReactNode
//   className: optional extra class on the wrapper
//   speed: pixels per second (default 32) — distance / speed sets duration
//
// Usage:
//   <Marquee>{job.name}</Marquee>

export default function Marquee({ children, className = '', speed = 32 }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);

  // Re-measure when content or layout changes.
  useLayoutEffect(() => {
    function measure() {
      const w = wrapRef.current;
      const i = innerRef.current;
      if (!w || !i) return;
      const wrapW = w.clientWidth;
      const innerW = i.scrollWidth;
      const overflowAmount = innerW - wrapW;
      if (overflowAmount > 2) {
        setOverflow(true);
        setDistance(overflowAmount);
        // 1.4s rest at each end + travel time both ways. Round so the
        // CSS animation lines up cleanly.
        const travel = overflowAmount / Math.max(speed, 1);
        setDuration(Math.max(6, travel * 2 + 2.8));
      } else {
        setOverflow(false);
      }
    }
    measure();

    // Re-measure on resize (e.g., orientation change, sheet open/close).
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      if (wrapRef.current) ro.observe(wrapRef.current);
      if (innerRef.current) ro.observe(innerRef.current);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [children, speed]);

  // Honor reduced motion: skip animation, just show truncated text.
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const innerStyle = overflow && !reduced
    ? {
        animationDuration: `${duration}s`,
        '--marquee-distance': `-${distance}px`,
      }
    : undefined;

  return (
    <span
      ref={wrapRef}
      className={`marquee${overflow && !reduced ? ' marquee--scroll' : ''} ${className}`.trim()}
    >
      <span ref={innerRef} className="marquee-inner" style={innerStyle}>
        {children}
      </span>
    </span>
  );
}
