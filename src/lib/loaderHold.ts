// withMinDuration — wraps a work promise so the caller waits at least
// `minMs` even when work resolves faster. Used to give loading flavor
// phrases time to land before the UI snaps to the next stage.
//
// Usage:
//   const r = await withMinDuration(doWork(), 4500);
//   await fadeOutLoader(setIsFading);
//   setStage('done');
export async function withMinDuration<T>(workPromise: Promise<T>, minMs = 4500): Promise<T> {
    const minDelay = new Promise<void>((r) => { setTimeout(r, minMs); });
    const [result] = await Promise.all([workPromise, minDelay]);
    return result;
}

// fadeOutLoader — flips the .is-fading-out class on the progress block
// and waits for the CSS animation to finish before resolving so the
// caller can advance the stage right after.
export async function fadeOutLoader(
    setIsFading: (fading: boolean) => void,
    fadeMs = 300,
): Promise<void> {
    setIsFading(true);
    await new Promise<void>((r) => { setTimeout(r, fadeMs); });
}
