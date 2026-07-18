import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/main.ts'],
    format: ['esm'],
    external: ['electron'],
    outDir: 'dist/main',
    clean: true,
  },
  {
    entry: ['src/preload.ts'],
    format: ['cjs'],
    external: ['electron'],
    noExternal: ['zod', '@codex-context-bridge/contracts'],
    outDir: 'dist/main',
    outExtension: () => ({ js: '.cjs' }),
  },
]);
