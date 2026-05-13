"use client";

import { useMemo } from "react";

import { DotMatrixBase , rowMajorIndex } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion , useSteppedCycle } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare13Props = IDotMatrixCommonProps;

type FrameCell = "." | "o" | "x";

const BASE_OPACITY = 0.08;
const ON_OPACITY = 0.56;
const PEAK_OPACITY = 1;

// Each 25-char string is the 5x5 row-major mask. Rows are visually grouped
// in arrays then joined to preserve readability without `no-useless-concat`.
const buildMask = (rows: readonly string[]): string => rows.join("");

const FRAME_MASKS: readonly string[] = [
    // N
    buildMask(["..x..", "..x..", "..o..", ".....", "....."]),
    // NE
    buildMask(["....x", "...x.", "..o..", ".....", "....."]),
    // E
    buildMask([".....", ".....", "..oxx", ".....", "....."]),
    // SE
    buildMask([".....", ".....", "..o..", "...x.", "....x"]),
    // S
    buildMask([".....", ".....", "..o..", "..x..", "..x.."]),
    // SW
    buildMask([".....", ".....", "..o..", ".x...", "x...."]),
    // W
    buildMask([".....", ".....", "xxo..", ".....", "....."]),
    // NW
    buildMask(["x....", ".x...", "..o..", ".....", "....."]),
];

const FRAME_SEQUENCE: readonly number[] = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7];

function maskCell(mask: string, row: number, col: number): FrameCell {
    return (mask[rowMajorIndex(row, col)] as FrameCell | undefined) ?? ".";
}

export const DotmSquare13 = ({
    speed = 1.85,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare13Props) => {
    const reducedMotion = usePrefersReducedMotion();
    const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
        animated: Boolean(animated && !reducedMotion),
        hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
        speed
    });
    const sequenceLength = FRAME_SEQUENCE.length;
    const step = useSteppedCycle({
        active: !reducedMotion && matrixPhase !== "idle" && sequenceLength > 0,
        cycleMsBase: 1550,
        steps: sequenceLength,
        speed,
    });

    const resolver = useMemo<DotAnimationResolver>(() => {
        const frameIndex = FRAME_SEQUENCE[step] ?? 0;
        // `!` justified: FRAME_MASKS is a non-empty readonly tuple; index 0 is fully populated.
        const mask = FRAME_MASKS[frameIndex] ?? FRAME_MASKS[0]!;

        return ({ isActive, row, col }) => {
            if (!isActive) {
                return { className: "dmx-inactive" };
            }

            const cell = maskCell(mask, row, col);
            if (cell === "x") {
                return { style: { opacity: PEAK_OPACITY } };
            }
            if (cell === "o") {
                return { style: { opacity: ON_OPACITY } };
            }
            return { style: { opacity: BASE_OPACITY } };
        };
    }, [step]);

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
