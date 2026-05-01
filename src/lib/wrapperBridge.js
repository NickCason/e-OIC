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

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') {
        reject(new Error('Unexpected FileReader result'));
        return;
      }
      const idx = r.indexOf(',');
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

// Bridge entry: write the File to Capacitor's CACHE directory, then call
// the Share plugin with the resulting file:// URI. Bypasses Chrome's
// share_service_impl.cc allowlist by going straight through Android's
// Intent.ACTION_SEND via Capacitor's FileProvider.
export async function shareViaCapacitor(file) {
  const Capacitor = globalThis.Capacitor;
  const Filesystem = Capacitor?.Plugins?.Filesystem;
  const Share = Capacitor?.Plugins?.Share;
  if (!Filesystem || !Share) {
    throw new Error('Capacitor Share/Filesystem plugin not available');
  }
  const base64 = await fileToBase64(file);
  const path = `eoic-share-${Date.now()}-${file.name}`;
  const written = await Filesystem.writeFile({
    path,
    directory: 'CACHE',
    data: base64,
    recursive: false,
  });
  try {
    await Share.share({
      title: file.name,
      files: [written.uri],
    });
  } finally {
    Filesystem.deleteFile({ path, directory: 'CACHE' }).catch(() => {});
  }
}
