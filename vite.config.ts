import { defineConfig } from 'vite';

export default defineConfig({
  base: '/dream-estate-builder/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
