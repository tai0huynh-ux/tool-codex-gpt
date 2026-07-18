import { NativeExtensionBridge } from './native-bridge';
import { createExtensionOperationExecutor } from './operation-executor';

const NATIVE_HOST_NAME = 'com.codex_context_bridge.host';

const manifest = chrome.runtime.getManifest();
if (manifest.permissions?.includes('nativeMessaging')) {
  const bridge = new NativeExtensionBridge({
    hostName: NATIVE_HOST_NAME,
    connectNative: (hostName) => chrome.runtime.connectNative(hostName),
    executor: createExtensionOperationExecutor({
      query: (queryInfo) => chrome.tabs.query(queryInfo),
      sendMessage: (tabId, message) => chrome.tabs.sendMessage(tabId, message),
    }),
  });
  bridge.start();
}
