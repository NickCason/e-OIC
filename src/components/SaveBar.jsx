import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// Sticky "Save & next row →" action bar.
//
// Props:
//   onSaveAndNext: () => void
//   nextLabel: 'next' | 'new'  ('next' → "Save & next row →"; 'new' → "+ New row")
//   pulseSavedKey: any  — when this prop changes, the "Saved ✓" pill flashes
//                          for 1.2s. Pass a counter from the parent that bumps
//                          on every successful autosave.

export default function SaveBar({ onSaveAndNext, nextLabel = 'next', pulseSavedKey }) {
  const [showSaved, setShowSaved] = useState(false);
  const timerRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setShowSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowSaved(false), 1200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pulseSavedKey]);

  return (
    <div className="savebar" role="region" aria-label="Save and continue">
      <div className={`savebar-saved${showSaved ? ' visible' : ''}`} aria-live="polite">
        <Icon name="check" size={14} strokeWidth={2.5} />
        <span>Saved</span>
      </div>
      <button
        type="button"
        className="savebar-cta"
        onClick={onSaveAndNext}
      >
        {nextLabel === 'new' ? (
          <>
            <Icon name="add" size={18} strokeWidth={2.25} />
            <span>New row</span>
          </>
        ) : (
          <>
            <span>Save &amp; next row</span>
            <Icon name="arrowRight" size={18} strokeWidth={2.25} />
          </>
        )}
      </button>
    </div>
  );
}
