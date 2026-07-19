// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  captureConversationPage,
  captureLongConversation,
  captureRenderedConversation,
} from './capture';

describe('ChatGPT capture spike', () => {
  it('captures a valid empty snapshot for a new ChatGPT page', async () => {
    document.body.innerHTML = '<main><textarea id="prompt-textarea"></textarea></main>';

    const snapshot = await captureConversationPage(
      document,
      new URL('https://chatgpt.com/') as unknown as Location,
    );

    expect(snapshot.messages).toEqual([]);
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

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

  it('accumulates ordered messages while a virtualized fixture replaces rendered nodes', async () => {
    document.body.innerHTML = '<h1>Virtualized</h1><main id="messages"></main>';
    const container = document.createElement('div');
    let scrollTop = 150;
    const messages = ['one', 'two', 'three', 'four'];
    const render = () => {
      const start = Math.min(2, Math.floor(scrollTop / 100));
      const messageRoot = document.querySelector('#messages');
      if (!messageRoot) throw new Error('TEST_MESSAGE_ROOT_NOT_FOUND');
      messageRoot.innerHTML = messages
        .slice(start, start + 2)
        .map(
          (text, offset) =>
            `<article data-message-author-role="user" data-message-id="message-${String(start + offset)}" data-message-index="${String(start + offset)}">${text}</article>`,
        )
        .join('');
    };
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 300 },
      scrollTop: { get: () => scrollTop },
    });
    container.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
      scrollTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
      render();
    };
    render();

    const snapshot = await captureLongConversation(document, container, { settleMs: 0 });
    expect(snapshot.messages.map((message) => message.text)).toEqual(messages);
    expect(scrollTop).toBe(150);
  });

  it('supports cancellation and reports selector failure', async () => {
    document.body.innerHTML = '<h1>Empty</h1>';
    const container = document.createElement('div');
    container.scrollTo = () => undefined;
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 100 },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      captureLongConversation(document, container, { signal: controller.signal, settleMs: 0 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(captureLongConversation(document, container, { settleMs: 0 })).rejects.toThrow(
      'CHAT_CAPTURE_MESSAGES_NOT_FOUND',
    );
  });

  it('updates a stable message when streaming text changes between passes', async () => {
    document.body.innerHTML = '<h1>Streaming</h1><main id="messages"></main>';
    const container = document.createElement('div');
    let renders = 0;
    container.scrollTo = () => {
      renders += 1;
      const messageRoot = document.querySelector('#messages');
      if (!messageRoot) throw new Error('TEST_MESSAGE_ROOT_NOT_FOUND');
      messageRoot.innerHTML = `<article data-message-author-role="assistant" data-message-id="stream-1" data-message-index="0">${renders > 1 ? 'Complete response' : 'Draft response'}</article>`;
    };
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 100 },
      scrollTop: { value: 0 },
    });

    const snapshot = await captureLongConversation(document, container, { settleMs: 0 });
    expect(snapshot.messages).toEqual([{ role: 'assistant', text: 'Complete response' }]);
  });
});
