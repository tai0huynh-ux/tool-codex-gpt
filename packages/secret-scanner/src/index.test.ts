import { describe, expect, it } from 'vitest';
import { assertNoSecrets, scanTextForSecrets } from './index';

describe('secret scanner', () => {
  it('blocks secret fixtures without storing real credentials in the repository', () => {
    const privateKeyFixture = ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('');
    const apiKeyFixture = ['sk-', 'fixture_only_', '12345678901234567890'].join('');

    expect(scanTextForSecrets(privateKeyFixture)).toEqual([
      expect.objectContaining({ ruleId: 'private-key' }),
    ]);
    expect(() => assertNoSecrets(apiKeyFixture)).toThrow('SECRET_DETECTED');
  });

  it('allows ordinary source text', () => {
    expect(scanTextForSecrets('const mode = "assisted";')).toEqual([]);
  });
});
