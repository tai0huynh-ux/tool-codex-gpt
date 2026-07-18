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
};

describe('extension production manifest boundary', () => {
  it('builds the dormant service worker without silently activating native messaging', () => {
    expect(manifest.background?.service_worker).toBe('service-worker.js');
    expect(manifest.permissions).not.toContain('nativeMessaging');
    expect(manifest.host_permissions).toEqual(['https://chatgpt.com/*']);
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });
});
