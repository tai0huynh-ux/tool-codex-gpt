import { openDatabase } from '@codex-context-bridge/database';
import { describe, expect, it } from 'vitest';
import { ProjectRegistry } from './index';

describe('ProjectRegistry', () => {
  it('supports create, read, update, list, and delete', () => {
    const database = openDatabase(':memory:');
    const registry = new ProjectRegistry(database);
    const created = registry.create('Bridge', 'project-1');

    expect(registry.get(created.id)?.name).toBe('Bridge');
    expect(registry.update(created.id, 'Bridge renamed')?.name).toBe('Bridge renamed');
    expect(registry.list()).toHaveLength(1);
    expect(registry.delete(created.id)).toBe(true);
    expect(registry.get(created.id)).toBeUndefined();
    database.close();
  });
});
