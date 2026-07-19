import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  LocalTransportOperation,
  LocalTransportResult,
} from '@codex-context-bridge/contracts';
import { MockCodexAdapter } from '@codex-context-bridge/codex-adapter';
import { openDatabase } from '@codex-context-bridge/database';
import { ProjectRegistry } from '@codex-context-bridge/project-registry';
import { ResponseRouter } from '@codex-context-bridge/response-router';
import { WorkflowEngine } from '@codex-context-bridge/workflow-engine';
import { describe, expect, it } from 'vitest';
import type { DesktopBridgeService } from '../../apps/desktop/src/ipc';
import { createPilotDesktopService } from '../../apps/desktop/src/pilot-ipc';
import { PILOT_HEADING, PILOT_PARAGRAPH } from '../../apps/desktop/src/website-verifier';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fixtureBridge(): DesktopBridgeService {
  let insertedText = '';
  const execute = async (operation: LocalTransportOperation): Promise<LocalTransportResult> => {
    await Promise.resolve();
    switch (operation.type) {
      case 'page.inspect':
        return {
          type: 'page.inspect.result',
          inspection: {
            page: { mode: 'new' },
            composer: { available: true, readOnly: false },
          },
        };
      case 'page.reload':
        return { type: 'page.reload.result', reloaded: true };
      case 'page.status':
        return {
          type: 'page.status.result',
          streaming: false,
          structuredResponse: {
            ok: true,
            response: {
              protocolVersion: '1.0',
              handoffId: operation.expectedHandoffId ?? 'fixture-handoff',
              correlationId: operation.expectedCorrelationId ?? 'fixture-correlation',
              projectId: operation.expectedProjectId ?? 'project-1',
              status: 'ready_for_codex',
              analysisSummary: 'Fixture ChatGPT returned a validated Codex prompt.',
              codexPrompt: 'Create index.html and styles.css in the registered repository.',
              attachmentsRequested: [],
              requiresUserDecision: false,
            },
          },
        };
      case 'composer.insert':
        insertedText = operation.text;
        return {
          type: 'composer.insert.result',
          inserted: true,
          sent: false,
          textHash: sha256(operation.text.trim()),
        };
      case 'composer.submit':
        return {
          type: 'composer.submit.result',
          submitted: true,
          textHash: operation.expectedTextHash,
        };
      case 'conversation.capture':
        return {
          type: 'conversation.capture.result',
          snapshot: {
            title: 'Fixture pilot',
            messages: insertedText ? [{ role: 'user', text: insertedText }] : [],
            contentHash: 'e'.repeat(64),
            capturedAt: '2026-07-19T14:00:00.000Z',
          },
        };
      case 'bridge.health':
        return { type: 'bridge.health.result', status: 'ready' };
      case 'composer.clear':
        return { type: 'composer.clear.result', cleared: true };
    }
  };
  return {
    getStatus: () =>
      Promise.resolve({
        transport: 'native_messaging',
        state: 'connected',
        permissionActive: true,
      }),
    execute,
  };
}

describe('project pilot fixture', () => {
  it('runs the reviewed app orchestration through website verification and persistence', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'codex-context-bridge-live-pilot-'));
    const database = openDatabase(':memory:');
    try {
      writeFileSync(path.join(root, 'README.md'), '# Fixture pilot\n', 'utf8');
      const projects = new ProjectRegistry(database, () => '2026-07-19T14:00:00.000Z');
      projects.create('AI Website Pilot', 'project-1');
      projects.registerRepository('project-1', { repoRoot: root, branch: 'main' }, 'repository-1');
      const workflows = new WorkflowEngine(database, {
        now: () => '2026-07-19T14:00:00.000Z',
      });
      const codex = new MockCodexAdapter({
        execute: async () => {
          await Promise.resolve();
          writeFileSync(
            path.join(root, 'index.html'),
            `<!doctype html><html lang="vi"><head><link rel="stylesheet" href="styles.css"></head><body><h1>${PILOT_HEADING}</h1><p>${PILOT_PARAGRAPH}</p></body></html>`,
            'utf8',
          );
          writeFileSync(
            path.join(root, 'styles.css'),
            'body { font-family: sans-serif; }\n',
            'utf8',
          );
          return 'Fixture Codex created a static website.';
        },
      });
      const service = createPilotDesktopService({
        database,
        projects,
        workflows,
        bridge: fixtureBridge(),
        codex,
        router: new ResponseRouter(database, workflows, projects, codex),
        now: () => '2026-07-19T14:00:00.000Z',
      });

      const created = await service.create({
        projectId: 'project-1',
        repositoryId: 'repository-1',
        objective: 'Create a static website.',
        destination: { mode: 'new' },
      });
      const prepared = await service.prepareChatGpt(created.id);
      expect(prepared.status).toBe('chatgpt_ready');
      const submitted = await service.approveChatGpt(created.id);
      expect(submitted.status).toBe('chatgpt_dispatched');
      const routed = await service.captureChatGpt(created.id);
      expect(routed.status).toBe('codex_ready');
      const running = await service.approveCodex(created.id);
      expect(running.status).toBe('codex_running');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const completed = await service.refresh(created.id);
      expect(completed.status).toBe('codex_completed');
      expect(readFileSync(path.join(root, 'index.html'), 'utf8')).toContain(PILOT_HEADING);
      const verified = await service.verifyWebsite(created.id);
      expect(verified.websiteVerification?.status).toBe('passed');
      expect((await service.list('project-1'))[0]?.websiteVerification?.status).toBe('passed');
    } finally {
      database.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
