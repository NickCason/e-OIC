import React, { useState, useEffect } from 'react';
import schemaMap from '../schema.json';
import { getJob, getPanel, listRows, listPanelPhotos } from '../db.js';
import { nav } from '../App.jsx';
import SheetForm from './SheetForm.jsx';

const SHEET_ORDER = [
  'Panels', 'Power', 'PLC Racks', 'PLC Slots', 'Fieldbus IO',
  'Network Devices', 'HMIs', 'Ethernet Switches', 'Drive Parameters',
  'Conv. Speeds', 'Safety Circuit', 'Safety Devices', 'Peer to Peer Comms',
];

export default function PanelView({ jobId, panelId }) {
  const [job, setJob] = useState(null);
  const [panel, setPanel] = useState(null);
  const [activeSheet, setActiveSheet] = useState('Panels');
  const [progress, setProgress] = useState({});

  async function refreshProgress() {
    const p = {};
    const allPhotos = await listPanelPhotos(panelId);
    for (const sheet of SHEET_ORDER) {
      const rows = await listRows(panelId, sheet);
      const sheetPhotos = allPhotos.filter((ph) => ph.sheet === sheet);
      const requiredItems = (schemaMap[sheet]?.photo_checklist_columns || []).length;
      let state = 'empty';
      if (rows.length > 0) {
        state = 'partial';
        if (requiredItems === 0 || sheetPhotos.length >= requiredItems) state = 'complete';
      }
      p[sheet] = state;
    }
    setProgress(p);
  }

  useEffect(() => {
    (async () => {
      const j = await getJob(jobId);
      const pn = await getPanel(panelId);
      if (!j || !pn) { nav('/'); return; }
      setJob(j); setPanel(pn);
      refreshProgress();
    })();
  }, [jobId, panelId]);

  if (!job || !panel) return null;

  return (
    <>
      <header className="appbar">
        <button className="back" onClick={() => nav(`/job/${jobId}`)} aria-label="Back">‹</button>
        <div className="grow">
          <h1>{panel.name}</h1>
          <div className="crumb">{job.name}</div>
        </div>
      </header>
      <main>
        <div className="tabs">
          {SHEET_ORDER.map((s) => (
            <button
              key={s}
              className={'tab' + (activeSheet === s ? ' active' : '')}
              onClick={() => setActiveSheet(s)}
            >
              <span className={'dot ' + (progress[s] || 'empty')} />
              {s}
            </button>
          ))}
        </div>
        <SheetForm
          job={job}
          panel={panel}
          sheetName={activeSheet}
          onChange={refreshProgress}
        />
      </main>
    </>
  );
}
