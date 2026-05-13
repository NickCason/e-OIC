// Single source of truth: ../version.json (read by vite.config.js)
// and injected as __BUILD_VERSION__ at build time. Consumed in
// Settings → About, JobList header badge, PhotoCapture footer.
//
// Named export is intentional: consumers use `import { BUILD_VERSION }`
// to match the pattern of the rest of src/lib/ exports.
// eslint-disable-next-line import/prefer-default-export
export const BUILD_VERSION: string = __BUILD_VERSION__;
