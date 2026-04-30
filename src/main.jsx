import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { loadInitialTheme } from './lib/theme.js';

// Apply theme as early as possible to avoid a flash. We don't await this
// for the render — the default dark theme is already in CSS, and applyTheme
// just swaps the data-theme attribute when the saved value resolves.
loadInitialTheme();

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache: 'none' bypasses HTTP cache when checking for new SW
    // versions, so updates apply on the next page load instead of waiting
    // up to 24h for the browser's default SW cache window.
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
