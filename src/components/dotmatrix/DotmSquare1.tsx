"use client";

import type { CSSProperties } from "react";

import { DotMatrixBase , trBlPathNormFromIndex } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion } from "./hooks";
import type { DotAnimationResolver , IDotMatrixCommonProps } from "./core";

export type DotmSquare1Props = IDotMatrixCommonProps;

const animationResolver: DotAnimationResolver = ({
    isActive, index, row, col, reducedMotion, phase
}) => {
    if (!isActive) {
        return { className: "dmx-inactive" };
    }

    const path = trBlPathNormFromIndex(index);
    const slice = row + (4 - col);
    const parity = slice % 2;
    const style = {
        "--dmx-path": path,
        "--dmx-diagonal-parity": parity
    } as CSSProperties;

    if (reducedMotion || phase === "idle") {
        return {
            style: {
                ...style,
                opacity: parity === 0 ? 0.88 : 0.14
            }
        };
    }

    return { className: "dmx-diagonal-alt-sweep", style };
};

export const DotmSquare1 = ({
    speed = 1.1,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare1Props) => {
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
