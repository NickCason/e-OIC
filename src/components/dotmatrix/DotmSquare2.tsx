"use client";

import { useMemo } from "react";

import { DotMatrixBase , rowMajorIndex } from "./core";
import { useDotMatrixPhases , usePrefersReducedMotion , useSteppedCycle } from "./hooks";
import type { DotAnimationResolver, IDotMatrixCommonProps } from "./core";

export type DotmSquare2Props = IDotMatrixCommonProps;

const SNAKE_TAIL = [1, 0.82, 0.68, 0.54, 0.42, 0.31, 0.22, 0.14] as const;
const BASE_OPACITY = 0.08;

function buildRowCyclePath(): number[] {
    const path: number[] = [];
    const push = (row: number, col: number) => path.push(rowMajorIndex(row, col));

    // 1st col: bottom -> top
    for (let row = 4; row >= 0; row -= 1) push(row, 0);
    // top to 3rd col
    push(0, 1);
    push(0, 2);
    // 3rd col: top -> bottom
    for (let row = 1; row <= 4; row += 1) push(row, 2);
    // bottom left to 2nd col
    push(4, 1);
    // 2nd col: bottom -> top
    for (let row = 3; row >= 0; row -= 1) push(row, 1);
    // top right to 4th col
    push(0, 2);
    push(0, 3);
    // 4th col: top -> bottom
    for (let row = 1; row <= 4; row += 1) push(row, 3);
    // bottom left to 3rd col
    push(4, 2);
    // 3rd col: bottom -> top
    for (let row = 3; row >= 0; row -= 1) push(row, 2);
    // top right to 5th col
    push(0, 3);
    push(0, 4);
    // 5th col: top -> bottom
    for (let row = 1; row <= 4; row += 1) push(row, 4);

    return path;
}

export const DotmSquare2 = ({
    speed = 1.15,
    pattern = "full",
    animated = true,
    hoverAnimated = false,
    ...rest
}: DotmSquare2Props) => {
    const reducedMotion = usePrefersReducedMotion();
    const { phase: matrixPhase, onMouseEnter, onMouseLeave } = useDotMatrixPhases({
        animated: Boolean(animated && !reducedMotion),
        hoverAnimated: Boolean(hoverAnimated && !reducedMotion),
        speed
    });
    const route = useMemo(() => buildRowCyclePath(), []);
    const routeLen = route.length;
    const head = useSteppedCycle({
        active: !reducedMotion && matrixPhase !== "idle" && routeLen > 0,
        cycleMsBase: 1500,
        steps: routeLen,
        speed,
    });

    const visitsByIndex = useMemo(() => {
        const visits = new Map<number, number[]>();
        for (let step = 0; step < routeLen; step += 1) {
            const index = route[step]!;
            const list = visits.get(index) ?? [];
            list.push(step);
            visits.set(index, list);
        }
        return visits;
    }, [route, routeLen]);

    const animationResolver = useMemo<DotAnimationResolver>(() => {
        return ({ isActive, index }) => {
            if (!isActive) {
                return { className: "dmx-inactive" };
            }

            if (routeLen <= 0) {
                return { style: { opacity: BASE_OPACITY } };
            }

            const visits = visitsByIndex.get(index) ?? [];
            const opacity = visits.reduce((acc, stepIndex) => {
                const distance = (head - stepIndex + routeLen) % routeLen;
                if (distance >= 0 && distance < SNAKE_TAIL.length) {
                    // `!` justified: distance < SNAKE_TAIL.length, so the element is defined.
                    return Math.max(acc, SNAKE_TAIL[distance]!);
                }
                return acc;
            }, BASE_OPACITY);

            return { style: { opacity } };
        };
    }, [head, routeLen, visitsByIndex]);

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
