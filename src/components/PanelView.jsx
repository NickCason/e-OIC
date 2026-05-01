import React, { useState, useEffect, useRef } from 'react';
import { getJob, getPanel } from '../db.js';
import { getPanelProgress } from '../lib/metrics.js';
import { nav } from '../App.jsx';
import SheetForm from './SheetForm.jsx';
import AppBar from './AppBar.jsx';
import Icon from './Icon.jsx';
import SheetPicker from './SheetPicker.jsx';

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
  const [panelPercent, setPanelPercent] = useState(0);
  const [showSheetPicker, setShowSheetPicker] = useState(false);

  const tabsRef = useRef(null);
  useEffect(() => {
    const el = tabsRef.current?.querySelector('.tab.active');
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [activeSheet]);

  async function refreshProgress() {
    const { percent, sheetStatuses } = await getPanelProgress(panelId);
    setProgress(sheetStatuses);
    setPanelPercent(percent);
  }

  useEffect(() => {
    (async () => {
      const j = await getJob(jobId);
      const pn = await getPanel(panelId);
      if (!j || !pn) { nav('/'); return; }
      setJob(j); setPanel(pn);
      refreshProgress();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshProgress is a non-stable inline async fn; adding it would infinite-loop. Intent: run only when jobId/panelId change.
  }, [jobId, panelId]);

  if (!job || !panel) return null;

  const sheetStatus = (sheet) => progress[sheet] || 'empty';
  const idx = SHEET_ORDER.indexOf(activeSheet);
  const total = SHEET_ORDER.length;

  return (
    <>
      <AppBar
        onBack={() => nav(`/job/${jobId}`)}
        wordmark={job?.name || panel?.name || 'e-OIC'}
        crumb={panel?.name && job?.name ? panel.name : null}
      />
      <main>
        <div className="hero">
          <div className="hero-pretitle">
            {idx >= 0
              ? `PANEL · ${panelPercent}% COMPLETE · ${idx + 1} OF ${total} SHEETS`
              : 'PANEL'}
          </div>
          <h1 className="hero-title">{panel?.name || 'Panel'}</h1>
        </div>
        <div className="tabs" ref={tabsRef}>
          {SHEET_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={'tab' + (activeSheet === s ? ' active' : '')}
              onClick={() => setActiveSheet(s)}
            >
              <span className={`dot ${sheetStatus(s)}`} aria-hidden="true" />
              <span>{s}</span>
            </button>
          ))}
          <button
            type="button"
            className="tab tab--overflow"
            onClick={() => setShowSheetPicker(true)}
            aria-label="All sheets"
          >
            <Icon name="grid" size={14} />
          </button>
        </div>
        <SheetForm
          job={job}
          panel={panel}
          sheetName={activeSheet}
          onChange={refreshProgress}
        />
      </main>
      {showSheetPicker && (
        <SheetPicker
          sheets={SHEET_ORDER.map((s) => ({
            id: s,
            name: s,
            status: sheetStatus(s),
            counts: { rows: 0, total: 0 },
          }))}
          activeId={activeSheet}
          onPick={(id) => setActiveSheet(id)}
          onClose={() => setShowSheetPicker(false)}
        />
      )}
    </>
  );
}
