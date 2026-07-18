import { NATIVE_MESSAGING_HOST_NAME } from '@codex-context-bridge/contracts';
import { NativeExtensionBridge } from './native-bridge';
import { createExtensionOperationExecutor } from './operation-executor';

const manifest = chrome.runtime.getManifest();
if (manifest.permissions?.includes('nativeMessaging')) {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'bridge-content-ready'
    ) {
      return false;
    }
    return false;
  });

  const bridge = new NativeExtensionBridge({
    hostName: NATIVE_MESSAGING_HOST_NAME,
    connectNative: (hostName) => chrome.runtime.connectNative(hostName),
    executor: createExtensionOperationExecutor({
      query: (queryInfo) => chrome.tabs.query(queryInfo),
      sendMessage: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
      injectContentScript: async (tabId) => {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-script.js'],
        });
      },
    }),
  });
  bridge.start();
}
