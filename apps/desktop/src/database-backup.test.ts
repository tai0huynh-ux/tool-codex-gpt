import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupDatabaseBeforeUpgrade } from './database-backup';

describe('desktop database upgrade backup', () => {
  it('creates one versioned backup without overwriting the first recovery point', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'context-bridge-backup-'));
    try {
      const databasePath = path.join(directory, 'context-bridge.sqlite');
      writeFileSync(databasePath, 'before-upgrade');
      const backupPath = backupDatabaseBeforeUpgrade(databasePath, '0.1.0');
      writeFileSync(databasePath, 'after-upgrade');
      expect(backupDatabaseBeforeUpgrade(databasePath, '0.1.0')).toBe(backupPath);
      expect(readFileSync(backupPath ?? '', 'utf8')).toBe('before-upgrade');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does nothing for a clean profile without a database', () => {
    expect(
      backupDatabaseBeforeUpgrade('Z:/missing/context-bridge.sqlite', '0.1.0'),
    ).toBeUndefined();
  });
});
