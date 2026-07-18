import { Codex } from '@openai/codex-sdk';

const codex = new Codex();
const thread = codex.startThread({
  workingDirectory: process.cwd(),
  sandboxMode: 'read-only',
  skipGitRepoCheck: false,
});

const first = await thread.run(
  'Read package.json only. Reply with exactly: CODEX_CONTEXT_BRIDGE_READ_ONLY_OK',
);
if (!first.finalResponse.includes('CODEX_CONTEXT_BRIDGE_READ_ONLY_OK')) {
  throw new Error(`Unexpected first response: ${first.finalResponse}`);
}

const threadId = thread.id;
if (!threadId) throw new Error('The SDK did not return a thread ID.');

const resumed = codex.resumeThread(threadId, {
  workingDirectory: process.cwd(),
  sandboxMode: 'read-only',
  skipGitRepoCheck: false,
});
const second = await resumed.run('Reply with exactly: CODEX_CONTEXT_BRIDGE_RESUME_OK');
if (!second.finalResponse.includes('CODEX_CONTEXT_BRIDGE_RESUME_OK')) {
  throw new Error(`Unexpected resumed response: ${second.finalResponse}`);
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      threadId,
      firstFinalResponse: first.finalResponse,
      resumedFinalResponse: second.finalResponse,
    },
    null,
    2,
  ),
);
