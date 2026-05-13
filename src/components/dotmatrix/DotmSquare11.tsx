"use client";

import type { CSSProperties } from "react";

import { DotMatrixBase } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare11Props = IDotMatrixCommonProps;

const animationResolver: DotAnimationResolver = ({
    isActive, manhattanDistance, reducedMotion, phase
}) => {
    if (!isActive) {
        return { className: "dmx-inactive" };
    }

    const ring = Math.max(0, Math.min(4, manhattanDistance));
    const style = {
        "--dmx-ripple-ring": ring,
        "--dmx-ripple-parity": ring % 2
    } as CSSProperties;

    if (reducedMotion || phase === "idle") {
        return {
            style: {
                ...style,
                opacity: 0.2 + (1 - ring / 4) * 0.72
            }
        };
    }

    return { className: "dmx-ripple-echo", style };
};

export const DotmSquare11 = ({
    speed = 1.25,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare11Props) => {
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
