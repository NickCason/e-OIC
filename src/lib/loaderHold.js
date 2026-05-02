// withMinDuration — wraps a work promise so the caller waits at least
// `minMs` even when work resolves faster. Used to give loading flavor
// phrases time to land before the UI snaps to the next stage.
//
// Usage:
//   const r = await withMinDuration(doWork(), 4500);
//   await fadeOutLoader(setIsFading);
//   setStage('done');
export async function withMinDuration(workPromise, minMs = 4500) {
  const minDelay = new Promise((r) => setTimeout(r, minMs));
  const [result] = await Promise.all([workPromise, minDelay]);
  return result;
}

// fadeOutLoader — flips the .is-fading-out class on the progress block
// and waits for the CSS animation to finish before resolving so the
// caller can advance the stage right after.
export async function fadeOutLoader(setIsFading, fadeMs = 300) {
  setIsFading(true);
  await new Promise((r) => setTimeout(r, fadeMs));
}
