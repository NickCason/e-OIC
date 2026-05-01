// Single module gating all window.Capacitor interaction.
// All functions feature-detect at runtime so the module is safe to
// import in non-wrapper contexts (desktop, iOS Safari, vanilla Android Chrome).

export function isInWrapper() {
  const Capacitor = globalThis.Capacitor;
  return typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform() === true;
}

export function isAndroidWrapper() {
  if (!isInWrapper()) return false;
  return globalThis.Capacitor?.getPlatform?.() === 'android';
}

// Reads the wrapper APK version exposed by Android's
// addJavascriptInterface (`window.EoicWrapper`). The interface is
// installed before page load by the wrapper's MainActivity, so it is
// safe to call from any React effect.
export function getWrapperVersion() {
  const ew = globalThis.EoicWrapper;
  if (!ew || typeof ew.getVersion !== 'function') return null;
  try {
    const v = ew.getVersion();
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

function parseVersion(s) {
  if (typeof s !== 'string') return null;
  const m = /^v(\d+)$/.exec(s);
  return m ? parseInt(m[1], 10) : null;
}

export function compareWrapperVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa == null || pb == null) return 0;
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}
