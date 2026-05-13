import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { loadInitialTheme } from './lib/theme';
import { registerServiceWorker } from './lib/swUpdate';

// Apply theme as early as possible to avoid a flash. We don't await this
// for the render — the default dark theme is already in CSS, and applyTheme
// just swaps the data-theme attribute when the saved value resolves.
loadInitialTheme().catch((err: unknown) => console.warn('loadInitialTheme failed', err));

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root missing from index.html');
createRoot(rootEl).render(<App />);

// Signal the boot splash to fade out once React has had a frame to
// commit the first render. The splash coordinator in index.html holds
// for a minimum duration so we can't dismiss too early; this just
// removes the upper bound (no more orange-over-UI) once the app is
// actually ready.
requestAnimationFrame(() => {
    /* eslint-disable-next-line no-underscore-dangle -- __dismissSplash is the literal name the splash coordinator (inlined in index.html) installs on window; we can't rename it here */
    const dismiss = window.__dismissSplash;
    if (typeof dismiss === 'function') dismiss();
});

window.addEventListener('load', () => {
    registerServiceWorker().catch((err: unknown) => console.warn('registerServiceWorker failed', err));
});
