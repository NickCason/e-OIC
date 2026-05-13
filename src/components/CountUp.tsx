import { useEffect, useRef, useState } from 'react';

// CountUp — animates a numeric value from its previous display to the new
// target via requestAnimationFrame with easeOutCubic.
//
// On first mount, animates from 0 to value (so re-opening a screen rolls the
// numbers up fresh each time, which is the demo "feels alive" effect we want).
// On subsequent value changes, animates from the currently-displayed value
// to the new target, capturing in-flight progress so rapid updates don't
// snap.
//
// Renders only the rounded display number (with optional prefix/suffix), so
// it composes inline with surrounding text:
//   <>JOB · <CountUp value={x} />% COMPLETE</>
//
// Honors prefers-reduced-motion: snaps directly to the target without
// animation.

const REDUCED_MOTION = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ICountUpProps {
    value?: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
}

const CountUp = ({
    value = 0, duration = 600, prefix = '', suffix = '',
}: ICountUpProps) => {
    const [display, setDisplay] = useState<number>(REDUCED_MOTION ? value : 0);
    const rafRef = useRef<number | null>(null);
    const displayRef = useRef<number>(display);
    displayRef.current = display;

    useEffect(() => {
        if (REDUCED_MOTION || duration <= 0) {
            setDisplay(value);
            return undefined;
        }
        const from = displayRef.current;
        const to = value;
        if (from === to) return undefined;
        let start: number | null = null;
        function tick(ts: number): void {
            if (start === null) start = ts;
            const t = Math.min(1, (ts - start) / duration);
            const eased = 1 - (1 - t) ** 3;
            setDisplay(Math.round(from + (to - from) * eased));
            if (t < 1) rafRef.current = requestAnimationFrame(tick);
        }
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [value, duration]);

    return (
        <>
            {prefix}
            {display}
            {suffix}
        </>
    );
};

export default CountUp;
