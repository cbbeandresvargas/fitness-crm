import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

import path from 'node:path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    solidPlugin(),
  ],
  resolve: {
    alias: {
      'lucide-solid': path.resolve(import.meta.dirname, 'node_modules/lucide-solid/dist/esm/lucide-solid.mjs'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
});
