# Install the Edge Extension

1. Extract `codex-context-bridge-extension-0.1.0.zip` to a stable local directory.
2. Open `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the extracted directory containing `manifest.json`.
5. Confirm extension ID `ccchffnkidpolmnnlonbnakjjmphfdjp`.
6. Open `https://chatgpt.com/` in a tab you selected.

The extension requests only `storage`, `activeTab`, `scripting`, `nativeMessaging`, and `https://chatgpt.com/*`. It does not request cookies, history, or `<all_urls>`.

If the service worker sleeps, reload the ChatGPT tab. Its fixed `bridge-content-ready` message contains no page data and wakes the worker. If a tab predates installation, the worker may inject the allowlisted content script once after a missing-receiver error. Use **Reload** on `edge://extensions` after replacing an internal build.
