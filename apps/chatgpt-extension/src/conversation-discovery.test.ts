// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { discoverRenderedConversations } from './conversation-discovery';

describe('rendered ChatGPT conversation discovery', () => {
  it('groups rendered project conversations and preserves canonical paths', () => {
    document.body.innerHTML = `
      <nav>
        <a href="/g/project-1">Project Atlas</a>
        <a href="/g/project-1/c/conversation-1" aria-label="Plan MVP">ignored text</a>
        <a href="/c/conversation-2">Standalone chat</a>
        <a href="https://example.com/c/outside">Outside</a>
      </nav>`;

    expect(
      discoverRenderedConversations(
        document,
        new URL('https://chatgpt.com/g/project-1/c/conversation-1') as unknown as Location,
        () => '2026-07-20T08:00:00.000Z',
      ),
    ).toEqual({
      conversations: [
        {
          conversationId: 'conversation-1',
          conversationPath: '/g/project-1/c/conversation-1',
          title: 'Plan MVP',
          projectId: 'project-1',
          projectName: 'Project Atlas',
          current: true,
        },
        {
          conversationId: 'conversation-2',
          conversationPath: '/c/conversation-2',
          title: 'Standalone chat',
          current: false,
        },
      ],
      capturedAt: '2026-07-20T08:00:00.000Z',
      truncated: false,
    });
  });

  it('deduplicates duplicate rendered links', () => {
    document.body.innerHTML = `
      <a href="/c/conversation-1">First label</a>
      <a href="/c/conversation-1">Duplicate label</a>`;
    expect(
      discoverRenderedConversations(
        document,
        new URL('https://chatgpt.com/') as unknown as Location,
      ).conversations,
    ).toHaveLength(1);
  });

  it('canonicalizes sidebar links decorated with query strings or fragments', () => {
    document.body.innerHTML = `
      <a href="/c/conversation-1?model=gpt-5">Query chat</a>
      <a href="/g/project-1/c/conversation-2#latest">Project chat</a>`;

    expect(
      discoverRenderedConversations(
        document,
        new URL('https://chatgpt.com/') as unknown as Location,
      ).conversations,
    ).toEqual([
      expect.objectContaining({
        conversationId: 'conversation-1',
        conversationPath: '/c/conversation-1',
      }),
      expect.objectContaining({
        conversationId: 'conversation-2',
        conversationPath: '/g/project-1/c/conversation-2',
      }),
    ]);
  });
});
