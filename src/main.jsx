import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { loadInitialTheme } from './lib/theme';
import { registerServiceWorker } from './lib/swUpdate';

// Apply theme as early as possible to avoid a flash. We don't await this
// for the render — the default dark theme is already in CSS, and applyTheme
// just swaps the data-theme attribute when the saved value resolves.
loadInitialTheme();

createRoot(document.getElementById('root')).render(<App />);

// Signal the boot splash to fade out once React has had a frame to
// commit the first render. The splash coordinator in index.html holds
// for a minimum duration so we can't dismiss too early; this just
// removes the upper bound (no more orange-over-UI) once the app is
// actually ready.
requestAnimationFrame(() => {
  if (typeof window.__dismissSplash === 'function') {
    window.__dismissSplash();
  }
});

window.addEventListener('load', () => { registerServiceWorker(); });
