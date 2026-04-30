import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps everything path-relative so the build works whether
// you serve from `https://user.github.io/repo-name/` (GitHub Pages),
// the root of a custom domain, or even the local file system for testing.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Split the heavyweight export libs into their own chunk.
        // They're only loaded when the user taps "Build Export".
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
