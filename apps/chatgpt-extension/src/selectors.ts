export const selectors = {
  conversationTitle: ['main h1', 'header h1', 'title'],
  projectName: ['[data-testid="project-name"]', 'nav [aria-current="page"]'],
  messages: ['[data-message-author-role]', 'article[data-testid^="conversation-turn-"]'],
  composer: ['#prompt-textarea', '[contenteditable="true"][data-testid="prompt-textarea"]'],
  streaming: ['button[data-testid="stop-button"]', '[data-is-streaming="true"]'],
} as const;
