// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { captureRenderedConversation } from './capture';

describe('ChatGPT capture spike', () => {
  it('reads the visible title, project, and rendered messages from a fixture page', async () => {
    document.body.innerHTML = `
      <main>
        <h1>Bridge architecture</h1>
        <div data-testid="project-name">Context tools</div>
        <article data-message-author-role="user">Design a safe bridge.</article>
        <article data-message-author-role="assistant">Use assisted approval gates.</article>
      </main>
    `;

    const snapshot = await captureRenderedConversation(document);

    expect(snapshot.title).toBe('Bridge architecture');
    expect(snapshot.projectName).toBe('Context tools');
    expect(snapshot.messages).toEqual([
      { role: 'user', text: 'Design a safe bridge.' },
      { role: 'assistant', text: 'Use assisted approval gates.' },
    ]);
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
