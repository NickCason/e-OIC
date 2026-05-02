// holdAndFade — keeps the loader visible briefly after the work completes,
// then triggers a CSS fade-out. The caller toggles `isFading` via the
// passed setter; the actual fade-out is realized in CSS via an
// `.is-fading-out` class on the progress wrapper.
//
// Default timing: 600ms hold (so the loader's animation has time to
// breathe past whatever frame it was on when work finished) + 300ms
// fade-out duration. After this resolves, the caller should advance the
// stage (which unmounts the loader) and reset `isFading` to false.
//
// Usage:
//   const [isFading, setIsFading] = useState(false);
//   const result = await doWork();
//   await holdAndFade(setIsFading);
//   setStage('done');
//   setIsFading(false);
export async function holdAndFade(setIsFading, holdMs = 600, fadeMs = 300) {
  await new Promise((r) => setTimeout(r, holdMs));
  setIsFading(true);
  await new Promise((r) => setTimeout(r, fadeMs));
}
