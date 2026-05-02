"use client";

import { useState } from "react";

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
import type { DotMatrixCommonProps } from "./core";

// All 20 square-pattern loaders share the same DotMatrixCommonProps shape,
// so a random pick is a drop-in for any of them. Pick is captured once at
// mount via lazy useState so the variant stays stable across re-renders
// (e.g., progress percent updates) and only changes when the loader is
// unmounted and re-mounted.
const VARIANTS = [
  DotmSquare1, DotmSquare2, DotmSquare3, DotmSquare4, DotmSquare5,
  DotmSquare6, DotmSquare7, DotmSquare8, DotmSquare9, DotmSquare10,
  DotmSquare11, DotmSquare12, DotmSquare13, DotmSquare14, DotmSquare15,
  DotmSquare16, DotmSquare17, DotmSquare18, DotmSquare19, DotmSquare20,
];

export function RandomDotmSquare(props: DotMatrixCommonProps) {
  const [Variant] = useState(() => VARIANTS[Math.floor(Math.random() * VARIANTS.length)]);
  return <Variant {...props} />;
}
