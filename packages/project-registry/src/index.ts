import { randomUUID } from 'node:crypto';
import type { SqliteDatabase } from '@codex-context-bridge/database';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function mapProject(row: ProjectRow): Project {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class ProjectRegistry {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(name: string, id: string = randomUUID()): Project {
    const now = new Date().toISOString();
    this.database
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, name, now, now);
    return { id, name, createdAt: now, updatedAt: now };
  }

  public get(id: string): Project | undefined {
    const row = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      ProjectRow | undefined;
    return row ? mapProject(row) : undefined;
  }

  public list(): Project[] {
    return (
      this.database.prepare('SELECT * FROM projects ORDER BY created_at').all() as ProjectRow[]
    ).map(mapProject);
  }

  public update(id: string, name: string): Project | undefined {
    const updatedAt = new Date().toISOString();
    const result = this.database
      .prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, updatedAt, id);
    return result.changes === 0 ? undefined : this.get(id);
  }

  public delete(id: string): boolean {
    return this.database.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
  }
}
