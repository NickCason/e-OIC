import React, { useState, useEffect } from 'react';
import { listPhotos } from '../db.js';
import PhotoCapture from './PhotoCapture.jsx';

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

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [panel.id, sheetName, items.join('|')]);

  return (
    <div>
      <div style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 10 }}>
        Tap an item to capture photos. Each photo is auto-tagged with project, panel, item{' '}
        and (if location is enabled) GPS coordinates.
      </div>
      {items.map((item) => (
        <div key={item} className="photo-checklist-item" onClick={() => setOpenItem(item)} style={{ cursor: 'pointer' }}>
          <div className="head">
            <div className="name">{item}</div>
            <div className="count">{counts[item] || 0} 📷</div>
          </div>
        </div>
      ))}
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
