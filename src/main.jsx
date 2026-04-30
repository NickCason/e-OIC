import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { loadInitialTheme } from './lib/theme.js';
import { registerServiceWorker } from './lib/swUpdate.js';

// Apply theme as early as possible to avoid a flash. We don't await this
// for the render — the default dark theme is already in CSS, and applyTheme
// just swaps the data-theme attribute when the saved value resolves.
loadInitialTheme();

createRoot(document.getElementById('root')).render(<App />);

window.addEventListener('load', () => { registerServiceWorker(); });
