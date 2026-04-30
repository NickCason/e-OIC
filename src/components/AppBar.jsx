import React from 'react';
import Icon from './Icon.jsx';

// Reusable app bar.
//
// Props:
//   onBack: () => void  — if provided, renders a back chevron in the leading slot
//   wordmark: string     — slab-set text shown after the mark logo (default 'e-OIC')
//   crumb: string        — secondary line under the wordmark (panel/sheet/etc.)
//   actions: ReactNode   — trailing slot for icon buttons
//   onWordmarkClick: () => void — if provided, makes the wordmark a button
//
// The mark logo is drawn from a CSS background image (`--mark-src` token),
// which the theme swaps automatically between full-color (light) and
// white (dark).

export default function AppBar({ onBack, wordmark = 'e-OIC', crumb, actions, onWordmarkClick }) {
  const wordmarkInteractive = typeof onWordmarkClick === 'function';

  return (
    <header className="appbar">
      {onBack && (
        <button
          className="appbar-back"
          onClick={onBack}
          aria-label="Back"
          type="button"
        >
          <Icon name="back" size={22} strokeWidth={2} />
        </button>
      )}
      <div className="appbar-mark" role="img" aria-label="E Tech Group" />
      <div className="appbar-titles">
        {wordmarkInteractive ? (
          <button
            type="button"
            className="appbar-wordmark appbar-wordmark--button"
            onClick={onWordmarkClick}
          >
            {wordmark}
          </button>
        ) : (
          <h1 className="appbar-wordmark">{wordmark}</h1>
        )}
        {crumb && <div className="appbar-crumb">{crumb}</div>}
      </div>
      {actions && <div className="appbar-actions">{actions}</div>}
    </header>
  );
}
