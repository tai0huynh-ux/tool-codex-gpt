import { copyFileSync, existsSync } from 'node:fs';

export function backupDatabaseBeforeUpgrade(
  databasePath: string,
  version: string,
): string | undefined {
  if (!existsSync(databasePath)) return undefined;
  const safeVersion = version.replaceAll(/[^a-zA-Z0-9.-]/g, '_');
  const backupPath = `${databasePath}.backup-v${safeVersion}`;
  if (!existsSync(backupPath)) copyFileSync(databasePath, backupPath);
  return backupPath;
}
