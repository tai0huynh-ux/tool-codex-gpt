import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@codex-context-bridge/contracts': path.join(root, 'packages/contracts/src/index.ts'),
      '@codex-context-bridge/database': path.join(root, 'packages/database/src/index.ts'),
      '@codex-context-bridge/project-registry': path.join(
        root,
        'packages/project-registry/src/index.ts',
      ),
      '@codex-context-bridge/project-detector': path.join(
        root,
        'packages/project-detector/src/index.ts',
      ),
      '@codex-context-bridge/local-transport': path.join(
        root,
        'packages/local-transport/src/index.ts',
      ),
      '@codex-context-bridge/file-store': path.join(root, 'packages/file-store/src/index.ts'),
      '@codex-context-bridge/context-builder': path.join(
        root,
        'packages/context-builder/src/index.ts',
      ),
      '@codex-context-bridge/memory-engine': path.join(root, 'packages/memory-engine/src/index.ts'),
      '@codex-context-bridge/workflow-engine': path.join(
        root,
        'packages/workflow-engine/src/index.ts',
      ),
      '@codex-context-bridge/assisted-chatgpt': path.join(
        root,
        'packages/assisted-chatgpt/src/index.ts',
      ),
      '@codex-context-bridge/response-router': path.join(
        root,
        'packages/response-router/src/index.ts',
      ),
      '@codex-context-bridge/secret-scanner': path.join(
        root,
        'packages/secret-scanner/src/index.ts',
      ),
    },
  },
  test: {
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
