// Single source of truth: ../version.json (read by vite.config.js)
// and injected as __BUILD_VERSION__ at build time. Consumed in
// Settings → About, JobList header badge, PhotoCapture footer.
export const BUILD_VERSION = __BUILD_VERSION__;
