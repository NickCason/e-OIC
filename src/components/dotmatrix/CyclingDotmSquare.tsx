"use client";

import { useEffect, useState } from "react";

import { DotmSquare1 } from "./DotmSquare1";
import { DotmSquare2 } from "./DotmSquare2";
import { DotmSquare3 } from "./DotmSquare3";
import { DotmSquare4 } from "./DotmSquare4";
import { DotmSquare5 } from "./DotmSquare5";
import { DotmSquare6 } from "./DotmSquare6";
import { DotmSquare7 } from "./DotmSquare7";
import { DotmSquare8 } from "./DotmSquare8";
import { DotmSquare9 } from "./DotmSquare9";
import { DotmSquare10 } from "./DotmSquare10";
import { DotmSquare11 } from "./DotmSquare11";
import { DotmSquare12 } from "./DotmSquare12";
import { DotmSquare13 } from "./DotmSquare13";
import { DotmSquare14 } from "./DotmSquare14";
import { DotmSquare15 } from "./DotmSquare15";
import { DotmSquare16 } from "./DotmSquare16";
import { DotmSquare17 } from "./DotmSquare17";
import { DotmSquare18 } from "./DotmSquare18";
import { DotmSquare19 } from "./DotmSquare19";
import { DotmSquare20 } from "./DotmSquare20";
import type { IDotMatrixCommonProps } from "./core";

// Cycles through all 20 square loaders on a fixed interval, fading between
// them so the empty state always feels alive without any single animation
// dominating. Variants are mounted with a key so each cycle plays from its
// natural start phase rather than mid-loop.

const VARIANTS = [
    DotmSquare1, DotmSquare2, DotmSquare3, DotmSquare4, DotmSquare5,
    DotmSquare6, DotmSquare7, DotmSquare8, DotmSquare9, DotmSquare10,
    DotmSquare11, DotmSquare12, DotmSquare13, DotmSquare14, DotmSquare15,
    DotmSquare16, DotmSquare17, DotmSquare18, DotmSquare19, DotmSquare20,
] as const;

interface ICyclingDotmSquareProps extends IDotMatrixCommonProps {
    intervalMs?: number;
}

// eslint-disable-next-line import/prefer-default-export -- named export matches consumer-side import style for the dotmatrix family
export const CyclingDotmSquare = ({
    intervalMs = 2600,
    ...props
}: ICyclingDotmSquareProps) => {
    const [idx, setIdx] = useState(() => Math.floor(Math.random() * VARIANTS.length));

    useEffect(() => {
        const id = setInterval(() => {
            setIdx((i) => (i + 1) % VARIANTS.length);
        }, intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);

    // `as const` above narrows VARIANTS[idx] to never-undefined when idx is in-range;
    // we also fall back to the first variant for safety under noUncheckedIndexedAccess.
    const Variant = VARIANTS[idx] ?? VARIANTS[0];
    return (
        <span className="cycling-dotmatrix">
            {/* eslint-disable-next-line react/jsx-props-no-spreading -- forward presentational props to selected variant */}
            <Variant key={idx} {...props} />
        </span>
    );
};
