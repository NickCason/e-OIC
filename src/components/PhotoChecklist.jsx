import React, { useState, useEffect } from 'react';
import { listPhotos } from '../db.js';
import PhotoCapture from './PhotoCapture.jsx';
import Icon from './Icon.jsx';

// Renders the "Photo Checklist" group for the Panels sheet (panel-level shots
// like Full Panel, Each Door, etc.). Tappable, opens a capture modal.

export default function PhotoChecklist({ job, panel, sheetName, items }) {
  const [counts, setCounts] = useState({});
  const [openItem, setOpenItem] = useState(null);

  async function refresh() {
    const c = {};
    for (const item of items) {
      const ph = await listPhotos(panel.id, sheetName, item);
      c[item] = ph.length;
    }
    setCounts(c);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when photo context IDs change.
  useEffect(() => { refresh(); }, [panel.id, sheetName, items.join('|')]);

  return (
    <div>
      <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 10 }}>
        Tap an item to capture photos. Each photo is auto-tagged with project, panel, item{' '}
        and (if location is enabled) GPS coordinates.
      </div>
      {items.map((item) => {
        const count = counts[item] || 0;
        const done = count > 0;
        return (
          <div
            key={item}
            className={`checklist-row${done ? ' done' : ''}`}
            onClick={(e) => {
              const row = e.currentTarget;
              if (typeof row.scrollIntoView === 'function') {
                row.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }
              setOpenItem(item);
            }}
          >
            <span className="checklist-cb" aria-hidden="true">
              {done && <Icon name="check" size={12} strokeWidth={3} />}
            </span>
            <span className="checklist-name">{item}</span>
            <span className="checklist-count">{count}</span>
          </div>
        );
      })}
      {openItem && (
        <PhotoCapture
          job={job}
          panel={panel}
          sheetName={sheetName}
          item={openItem}
          rowId={null}
          onClose={() => { setOpenItem(null); refresh(); }}
        />
      )}
    </div>
  );
}
