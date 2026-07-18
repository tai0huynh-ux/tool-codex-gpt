import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/content-script.ts',
      formats: ['iife'],
      name: 'CodexContextBridgeCapture',
      fileName: () => 'content-script.js',
    },
  },
});
