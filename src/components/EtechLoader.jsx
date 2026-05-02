import React from 'react';
import './etech-loader.css';

// EtechLoader — eTechGroup-branded "T" mark loader.
//
// Variants control fill color only; the shape, animation amplitudes, and
// timing are identical:
//   'current' — inherits from currentColor (theme-friendly default)
//   'color'   — branded blue corners + orange bars (most distinctive)
//   'white'   — all white (use on dark/orange backgrounds)
//   'black'   — all black (use on light backgrounds where you want flat ink)
//
// Sizes scale with the SVG element. Animations are amplitude-based so
// they scale proportionally with size.

export default function EtechLoader({ variant = 'current', size = 24, ariaLabel = 'Loading' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-label={ariaLabel}
      role="img"
      shapeRendering="geometricPrecision"
      className={`etech-loader etech-loader--${variant}`}
    >
      <g className="corner tl">
        <path d="M144.12,236.1h31.03c11.9,0,17.86-14.39,9.45-22.81l-80.72-80.72,28.85-28.85,81.03,81.03c8.06,8.06,21.84,2.35,21.84-9.04v-103.24h-163.13v91.98l71.65,71.65Z" />
      </g>
      <g className="corner tr">
        <path d="M439.6,72.47h-163.13v71.51l-.07.07v31.83c0,11.61,14.04,17.43,22.25,9.22l80.61-80.61,28.51,28.51-80.3,80.3c-8.42,8.42-2.46,22.81,9.45,22.81h102.62v-71.58l.07-.07v-91.98Z" />
      </g>
      <g className="corner br">
        <path d="M408.11,379.1l-28.85,28.85-80.61-80.61c-8.21-8.21-22.25-2.4-22.25,9.22v31.83l71.15,71.15h91.98v-162.63h-103.25c-11.21,0-16.82,13.55-8.9,21.48l80.72,80.72Z" />
      </g>
      <g className="dot">
        <circle cx="255.94" cy="255.94" r="25.46" />
      </g>
      <g>
        <g transform="translate(-163.13 675.13) rotate(-90)">
          <g className="bar b1">
            <rect x="235.6" y="398.73" width="40.8" height="40.8" />
          </g>
        </g>
        <g transform="translate(-209.29 213.19) rotate(-45)">
          <g className="bar b2">
            <rect x="103.98" y="338.83" width="97.44" height="40.8" />
          </g>
        </g>
        <g transform="translate(-163.13 348.87) rotate(-90)">
          <g className="bar b3">
            <rect x="72.47" y="235.6" width="40.8" height="40.8" />
          </g>
        </g>
      </g>
    </svg>
  );
}
