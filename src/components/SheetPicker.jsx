import React from 'react';
import Icon from './Icon.jsx';

// Bottom-sheet picker for sheet selection.
//
// Props:
//   sheets: [{
//     id: string, name: string,
//     status: 'empty'|'partial'|'complete',
//     counts: { rows: number, photos: number, required: number }
//   }]
//   activeId: string
//   onPick: (sheetId) => void
//   onClose: () => void

function describeCounts(c) {
  if (!c) return '';
  // Sheets with a photo checklist: show photos taken / required.
  if (c.required > 0) return `${c.photos}/${c.required}`;
  // Sheets without photo requirements: surface row count instead.
  if (c.rows > 0) return `${c.rows} row${c.rows === 1 ? '' : 's'}`;
  return '—';
}

export default function SheetPicker({ sheets, activeId, onPick, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="sheet-picker" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-picker-grip" aria-hidden="true" />
        <h2 className="modal-title">All sheets</h2>
        <div className="sheet-picker-list">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sheet-picker-row${s.id === activeId ? ' active' : ''}`}
              onClick={() => { onPick(s.id); onClose(); }}
            >
              <span className={`sheet-picker-dot ${s.status}`} aria-hidden="true" />
              <span className="sheet-picker-name">{s.name}</span>
              <span className="sheet-picker-counts">{describeCounts(s.counts)}</span>
              <Icon name="next" size={16} className="sheet-picker-chev" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
