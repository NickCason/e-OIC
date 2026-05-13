import React, { useState, useEffect, useRef } from 'react';
import { getJob, getPanel } from '../db';
import { getPanelProgress } from '../lib/metrics';
import { nav } from '../App.jsx';
import SheetForm from './SheetForm.jsx';
import AppBar from './AppBar.jsx';
import Icon from './Icon';
import SheetPicker from './SheetPicker.jsx';
import Marquee from './Marquee.jsx';
import CountUp from './CountUp.jsx';

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
  const [counts, setCounts] = useState({});
  const [panelPercent, setPanelPercent] = useState(0);
  const [showSheetPicker, setShowSheetPicker] = useState(false);

  const tabsRef = useRef(null);
  const [inkRect, setInkRect] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const container = tabsRef.current;
    const el = container?.querySelector('.tab.active');
    if (!container || !el) return;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    // Measure relative to the scrollable container so the ink stays
    // glued under the active tab as the user scrolls horizontally.
    const cRect = container.getBoundingClientRect();
    const tRect = el.getBoundingClientRect();
    setInkRect({
      left: tRect.left - cRect.left + container.scrollLeft,
      width: tRect.width,
    });
  }, [activeSheet]);

  async function refreshProgress() {
    const { percent, sheetStatuses, sheetCounts } = await getPanelProgress(panelId);
    setProgress(sheetStatuses);
    setCounts(sheetCounts);
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

  if (!job || !panel) {
    return (
      <>
        <AppBar onBack={() => nav(`/job/${jobId}`)} wordmark="" />
        <main>
          <div className="hero">
            <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
            <div className="skeleton-bar skeleton-shimmer" style={{ width: '50%', height: 28, marginTop: 8 }} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-grow">
                <div className="skeleton-bar skeleton-bar--title skeleton-shimmer" />
                <div className="skeleton-bar skeleton-bar--sub skeleton-shimmer" />
              </div>
            </div>
          ))}
        </main>
      </>
    );
  }

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
              ? <>PANEL · <CountUp value={panelPercent} />% COMPLETE · <CountUp value={idx + 1} /> OF <CountUp value={total} /> SHEETS</>
              : 'PANEL'}
          </div>
          <h1 className="hero-title"><Marquee>{panel?.name || 'Panel'}</Marquee></h1>
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
          <span
            className="tab-ink"
            style={{ left: inkRect.left, width: inkRect.width }}
            aria-hidden="true"
          />
        </div>
        <div className="sheet-anim" key={activeSheet}>
          <SheetForm
            job={job}
            panel={panel}
            sheetName={activeSheet}
            onChange={refreshProgress}
          />
        </div>
      </main>
      {showSheetPicker && (
        <SheetPicker
          sheets={SHEET_ORDER.map((s) => ({
            id: s,
            name: s,
            status: sheetStatus(s),
            counts: counts[s] || { rows: 0, photos: 0, required: 0 },
          }))}
          activeId={activeSheet}
          onPick={(id) => setActiveSheet(id)}
          onClose={() => setShowSheetPicker(false)}
        />
      )}
    </>
  );
}
