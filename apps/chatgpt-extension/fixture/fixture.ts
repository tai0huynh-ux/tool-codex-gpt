import { captureRenderedConversation, type ConversationSnapshot } from '../src/capture';

declare global {
  interface Window {
    capturedFixture?: ConversationSnapshot;
  }
}

window.capturedFixture = await captureRenderedConversation(document);
