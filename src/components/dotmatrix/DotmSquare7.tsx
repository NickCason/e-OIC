"use client";

import { useMemo } from "react";

import { DotMatrixBase , rowMajorIndex } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion , useSteppedCycle } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare7Props = IDotMatrixCommonProps;

type FrameCell = "." | "o" | "x" | "c";

const BASE_OPACITY = 0.08;
const SETTLED_OPACITY = 0.42;
const ACTIVE_OPACITY = 1;
const CLEAR_OPACITY = 0.88;
const IDLE_STEP = 10;

// Each 25-char string is the 5x5 row-major mask. Rows are visually grouped
// in arrays then joined to preserve readability without `no-useless-concat`.
const buildMask = (rows: readonly string[]): string => rows.join("");

const FRAME_MASKS: readonly string[] = [
    buildMask([".....", ".....", ".....", ".....", "ooooo"]),
    buildMask([".....", ".....", ".....", "ooooo", "ooooo"]),
    buildMask([".....", ".....", "ooooo", "ooooo", "ooooo"]),
    buildMask([".....", "ooooo", "ooooo", "ooooo", "ooooo"]),
    buildMask(["ooooo", "ooooo", "ooooo", "ooooo", "ooooo"]),
    buildMask(["ccccc", "ccccc", "ccccc", "ccccc", "ccccc"]),
    buildMask([".....", ".....", ".....", ".....", "....."]),
    buildMask(["ccccc", "ccccc", "ccccc", "ccccc", "ccccc"]),
    buildMask([".....", ".....", ".....", ".....", "....."]),
    buildMask([".....", ".....", ".....", ".....", "....."]),
];

const FRAME_SEQUENCE: readonly number[] = [0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9];

function maskCell(mask: string, row: number, col: number): FrameCell {
    return (mask[rowMajorIndex(row, col)] as FrameCell | undefined) ?? ".";
}

export const DotmSquare7 = ({
    speed = 1.35,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare7Props) => {
    const reducedMotion = usePrefersReducedMotion();
    const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
        animated: Boolean(animated && !reducedMotion),
        hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
        speed
    });
    const sequenceLength = FRAME_SEQUENCE.length;
    const step = useSteppedCycle({
        active: !reducedMotion && matrixPhase !== "idle" && sequenceLength > 0,
        cycleMsBase: 1900,
        steps: sequenceLength,
        speed,
        idleStep: Math.min(IDLE_STEP, sequenceLength - 1)
    });

    const frame = FRAME_SEQUENCE[step] ?? FRAME_SEQUENCE[0] ?? 0;

    const resolver = useMemo<DotAnimationResolver>(() => {
        return ({ isActive, row, col }) => {
            if (!isActive) {
                return { className: "dmx-inactive" };
            }

            // `!` justified: FRAME_MASKS is a fully-populated readonly tuple covering every frame index.
            const cell = maskCell(FRAME_MASKS[frame]!, row, col);
            if (cell === "x") {
                return { style: { opacity: ACTIVE_OPACITY } };
            }
            if (cell === "o") {
                return { style: { opacity: SETTLED_OPACITY } };
            }
            if (cell === "c") {
                return { style: { opacity: CLEAR_OPACITY } };
            }
            return { style: { opacity: BASE_OPACITY } };
        };
    }, [frame]);

    return (
        <DotMatrixBase
            // eslint-disable-next-line react/jsx-props-no-spreading -- forward presentational props to DotMatrixBase
            {...rest}
            size={rest.size ?? 36}
            dotSize={rest.dotSize ?? 5}
            speed={speed}
            pattern={pattern}
            animated={animated}
            phase={matrixPhase}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            reducedMotion={reducedMotion}
            animationResolver={resolver}
        />
    );
};
