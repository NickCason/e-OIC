// Build-time marker so we can tell which deployed version is actually
// running on a given client. Bump this in lockstep with VERSION in
// public/service-worker.js. The PWA shows this in Settings -> About and
// in the PhotoCapture modal footer.
export const BUILD_VERSION = 'v8';
