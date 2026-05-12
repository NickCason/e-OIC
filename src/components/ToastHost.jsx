import React, { useState, useEffect } from 'react';
import { subscribe, dismiss } from '../lib/toast';
import Icon from './Icon.jsx';

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => subscribe(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host">
      {toasts.map((t) => {
        const isError = t.kind === 'error';
        const iconName = isError ? 'warn' : 'check';
        return (
          <div key={t.id} className={'toast ' + (isError ? 'error' : '')}>
            <span className="toast-icon"><Icon name={iconName} size={16} /></span>
            <span style={{ flex: 1 }}>{t.message}</span>
            {t.kind === 'undo' && (
              <button className="undo" onClick={t.onUndo}>Undo</button>
            )}
            <button
              className="ghost"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{ padding: '2px 6px', display: 'inline-flex' }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
