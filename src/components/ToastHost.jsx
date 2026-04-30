import React, { useState, useEffect } from 'react';
import { subscribe, dismiss } from '../lib/toast.js';

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => subscribe(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + (t.kind === 'error' ? 'error' : '')}>
          <span style={{ flex: 1 }}>{t.message}</span>
          {t.kind === 'undo' && (
            <button className="undo" onClick={t.onUndo}>Undo</button>
          )}
          <button className="ghost" onClick={() => dismiss(t.id)} aria-label="Dismiss" style={{ padding: '2px 6px', fontSize: 14 }}>✕</button>
        </div>
      ))}
    </div>
  );
}
