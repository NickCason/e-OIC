"use client";

import type { CSSProperties } from "react";

import { DotMatrixBase ,
    middleRingAntiClockwiseNormFromIndex,
    middleRingAntiClockwiseOrderValue,
    outerRingClockwiseNormFromIndex,
    outerRingClockwiseOrderValue} from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare4Props = IDotMatrixCommonProps;

const animationResolver: DotAnimationResolver = ({
    isActive, index, row, col, reducedMotion, phase
}) => {
    if (!isActive) {
        return { className: "dmx-inactive" };
    }

    const isCenter = row === 2 && col === 2;
    if (isCenter) {
        return { className: "dmx-inactive" };
    }

    const outerOrder = outerRingClockwiseOrderValue(index);
    if (outerOrder >= 0) {
        const outerNorm = outerRingClockwiseNormFromIndex(index);
        const style = { "--dmx-outer-order": outerOrder } as CSSProperties;
        if (reducedMotion || phase === "idle") {
            return {
                style: {
                    ...style,
                    opacity: 0.2 + outerNorm * 0.72
                }
            };
        }
        return { className: "dmx-outer-snake", style };
    }

    const middleOrder = middleRingAntiClockwiseOrderValue(index);
    const middleNorm = middleRingAntiClockwiseNormFromIndex(index);
    const style = { "--dmx-middle-order": middleOrder } as CSSProperties;
    if (reducedMotion || phase === "idle") {
        return {
            style: {
                ...style,
                opacity: 0.2 + middleNorm * 0.72
            }
        };
    }

    return { className: "dmx-middle-snake", style };
};

export const DotmSquare4 = ({
    speed = 1.35,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare4Props) => {
    const reducedMotion = usePrefersReducedMotion();
    const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
        animated: Boolean(animated && !reducedMotion),
        hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
        speed
    });

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
            animationResolver={animationResolver}
        />
    );
};
