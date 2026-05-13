import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// Smooth horizontal marquee for text that would otherwise truncate.
// Measures the inner text against the container and only animates when
// the inner is wider — short labels stay still.
//
// Animation uses an ease-in-out cubic-bezier so the scroll accelerates
// from rest, holds at each end, and decelerates back. Loops indefinitely.

export interface IMarqueeProps {
    children: ReactNode;
    className?: string;
    speed?: number;
}

type MarqueeStyle = CSSProperties & { '--marquee-distance'?: string };

const Marquee = ({ children, className = '', speed = 32 }: IMarqueeProps) => {
    const wrapRef = useRef<HTMLSpanElement | null>(null);
    const innerRef = useRef<HTMLSpanElement | null>(null);
    const [overflow, setOverflow] = useState<boolean>(false);
    const [distance, setDistance] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);

    // Re-measure when content or layout changes.
    useLayoutEffect(() => {
        function measure(): void {
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
    const reduced = typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const innerStyle: MarqueeStyle | undefined = overflow && !reduced
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
};

export default Marquee;
