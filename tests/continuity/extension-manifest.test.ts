import {
  NATIVE_MESSAGING_EXTENSION_ID,
  NATIVE_MESSAGING_HOST_NAME,
} from '@codex-context-bridge/contracts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, '../../apps/chatgpt-extension/public/manifest.json'),
    'utf8',
  ),
) as {
  permissions?: string[];
  host_permissions?: string[];
  background?: { service_worker?: string };
  key?: string;
};

describe('extension production manifest boundary', () => {
  it('activates only the explicitly authorized native messaging boundary', () => {
    expect(manifest.background?.service_worker).toBe('service-worker.js');
    expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting', 'nativeMessaging']);
    expect(manifest.host_permissions).toEqual(['https://chatgpt.com/*']);
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
    const publicKey = Buffer.from(manifest.key ?? '', 'base64');
    const extensionId = createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (character) =>
        String.fromCharCode(97 + Number.parseInt(character, 16)),
      );
    expect(extensionId).toBe(NATIVE_MESSAGING_EXTENSION_ID);
  });

  it('keeps installer registration restricted to the stable exact extension origin', () => {
    const installer = readFileSync(
      path.join(import.meta.dirname, '../../apps/desktop/build/installer.nsh'),
      'utf8',
    );
    expect(installer).toContain(`!define NATIVE_HOST_NAME "${NATIVE_MESSAGING_HOST_NAME}"`);
    expect(installer).toContain(
      `!define NATIVE_EXTENSION_ORIGIN "chrome-extension://${NATIVE_MESSAGING_EXTENSION_ID}/"`,
    );
    expect(installer).not.toContain('*');
    expect(installer).toContain('Google\\Chrome\\NativeMessagingHosts');
    expect(installer).toContain('Microsoft\\Edge\\NativeMessagingHosts');
    expect(installer).toContain('customUnInstall');
  });

  it('reports the authorized permission consistently from desktop and release metadata', () => {
    const desktopMain = readFileSync(
      path.join(import.meta.dirname, '../../apps/desktop/src/main.ts'),
      'utf8',
    );
    const packaging = readFileSync(
      path.join(import.meta.dirname, '../../scripts/package-windows.ps1'),
      'utf8',
    );
    expect(desktopMain).toContain('permissionActive: true');
    expect(packaging).toContain('permissionActive = $true');
    expect(desktopMain).not.toContain('permissionActive: false');
    expect(packaging).not.toContain('permissionActive = $false');
  });
});
