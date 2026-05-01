import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { version: BUILD_VERSION } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'version.json'), 'utf8')
);

// Rewrites the literal __BUILD_VERSION__ in public/service-worker.js
// to the actual version after Vite copies it into dist/. Runs in the
// closeBundle hook so it sees the final emitted file.
function injectSwVersion() {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(import.meta.dirname, 'dist', 'service-worker.js');
      const src = readFileSync(swPath, 'utf8');
      const out = src.replaceAll('__BUILD_VERSION__', BUILD_VERSION);
      if (out === src) {
        throw new Error(
          'inject-sw-version: __BUILD_VERSION__ placeholder not found in dist/service-worker.js'
        );
      }
      writeFileSync(swPath, out);
    },
  };
}

// `base: './'` keeps everything path-relative so the build works whether
// you serve from `https://user.github.io/repo-name/` (GitHub Pages),
// the root of a custom domain, or even the local file system for testing.
export default defineConfig({
  plugins: [react(), injectSwVersion()],
  base: './',
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          'export-libs': ['exceljs', 'jszip'],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
