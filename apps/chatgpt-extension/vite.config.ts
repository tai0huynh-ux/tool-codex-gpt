import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@codex-context-bridge/contracts': path.resolve(
        import.meta.dirname,
        '../../packages/contracts/src/index.ts',
      ),
    },
  },
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
