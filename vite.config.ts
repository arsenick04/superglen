import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base works both for local dev and for GitHub Pages (/superglen/).
  base: './',
  server: { host: true },
  preview: { host: true },
  build: {
    // Safari 16 on iOS is the oldest browser we support. No top-level await is used.
    target: ['es2022', 'safari16'],
    // rapier3d-compat inlines its WASM as base64 (~4.3 MB raw, ~1.7 MB gzip): expected.
    chunkSizeWarningLimit: 6000,
  },
});
