import path from 'node:path';
import { defineConfig } from 'vite';

// The Playwright fixture uses Vite's dev server and needs the same source alias as production builds.
export default defineConfig({
  resolve: {
    alias: {
      '@codex-context-bridge/contracts': path.resolve(
        import.meta.dirname,
        '../../packages/contracts/src/index.ts',
      ),
    },
  },
});
