"use client";

import type { CSSProperties } from "react";

import { DotMatrixBase , spiralInwardNormFromIndex, spiralInwardOrderValue } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare3Props = IDotMatrixCommonProps;

const animationResolver: DotAnimationResolver = ({
    isActive, index, reducedMotion, phase
}) => {
    if (!isActive) {
        return { className: "dmx-inactive" };
    }

    const order = spiralInwardOrderValue(index);
    const pathNorm = spiralInwardNormFromIndex(index);
    const style = { "--dmx-spiral-order": order } as CSSProperties;

    if (reducedMotion || phase === "idle") {
        return {
            style: {
                ...style,
                opacity: 0.16 + pathNorm * 0.78
            }
        };
    }

    return { className: "dmx-spiral-snake", style };
};

export const DotmSquare3 = ({
    speed = 1.35,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare3Props) => {
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
