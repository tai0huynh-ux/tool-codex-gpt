import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/native-host-entry.ts'],
  format: ['cjs'],
  platform: 'node',
  outDir: 'dist/native-host',
  clean: true,
  noExternal: ['@codex-context-bridge/contracts', '@codex-context-bridge/local-transport', 'zod'],
});
