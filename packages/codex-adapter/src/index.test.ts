import { describe, expect, it } from 'vitest';
import { MockCodexAdapter } from './index';

describe('MockCodexAdapter', () => {
  it('preserves project identity and resumes the same structured thread', async () => {
    const adapter = new MockCodexAdapter();
    const thread = await adapter.startThread({
      projectId: 'project-1',
      repositoryFingerprint: 'fingerprint-1',
      workingDirectory: 'C:/work/bridge',
    });

    expect(await adapter.resumeThread(thread.id)).toEqual(thread);
    expect((await adapter.runTurn(thread.id, 'read only')).finalResponse).toBe(
      'MOCK_ONLY:read only',
    );
  });
});
