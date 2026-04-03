import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/iclaw/',
  plugins: [react()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'orama': ['@orama/orama'],
          'git': ['isomorphic-git'],
          'wllama': ['@wllama/wllama'],
        },
      },
    },
  },
  // Allow Vite to handle WASM and worker files from @wllama/wllama
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@wllama/wllama'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
