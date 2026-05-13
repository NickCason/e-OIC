"use client";

import { useMemo, type CSSProperties } from "react";

import { DotMatrixBase } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare6Props = IDotMatrixCommonProps;

const COLUMN_HEIGHT = 5;

export const DotmSquare6 = ({
    speed = 2.2,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare6Props) => {
    const reducedMotion = usePrefersReducedMotion();
    const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
        animated: Boolean(animated && !reducedMotion),
        hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
        speed
    });

    const animationResolver = useMemo<DotAnimationResolver>(() => {
        return ({
            isActive, row, col, phase
        }) => {
            if (!isActive) {
                return { className: "dmx-inactive" };
            }

            const goesUp = col % 2 === 0;
            const position = goesUp ? COLUMN_HEIGHT - 1 - row : row;

            if (reducedMotion || phase === "idle") {
                return { style: { opacity: 0.22 + (position / (COLUMN_HEIGHT - 1)) * 0.66 } };
            }

            return {
                className: "dmx-square6-col-snake",
                style: { "--dmx-col-pos": position } as CSSProperties
            };
        };
    }, [reducedMotion]);

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
