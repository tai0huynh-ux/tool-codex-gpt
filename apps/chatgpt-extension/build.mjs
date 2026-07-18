import path from 'node:path';
import { build } from 'vite';

const root = import.meta.dirname;
const alias = {
  '@codex-context-bridge/contracts': path.resolve(root, '../../packages/contracts/src/index.ts'),
};

async function buildEntry(entry, fileName, emptyOutDir, publicDir) {
  await build({
    configFile: false,
    root,
    publicDir,
    resolve: { alias },
    build: {
      outDir: 'dist',
      emptyOutDir,
      lib: {
        entry: path.resolve(root, entry),
        formats: ['iife'],
        name:
          fileName === 'content-script.js'
            ? 'CodexContextBridgeCapture'
            : 'CodexContextBridgeWorker',
        fileName: () => fileName,
      },
    },
  });
}

await buildEntry('src/content-script.ts', 'content-script.js', true, 'public');
await buildEntry('src/service-worker.ts', 'service-worker.js', false, false);
