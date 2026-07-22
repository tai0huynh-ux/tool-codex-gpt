import { createHash, randomUUID } from 'node:crypto';
import {
  conversationSnapshotSchema,
  type ConversationSnapshot,
} from '@codex-context-bridge/contracts';
import type { SqliteDatabase } from '@codex-context-bridge/database';

const MAX_ARCHIVE_MESSAGES = 5_000;
const MAX_ARCHIVE_MESSAGE_CHARACTERS = 100_000;
const MAX_ARCHIVE_TOTAL_CHARACTERS = 240_000;
const CHAT_ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

interface ChatSourceRow {
  id: string;
  project_id: string;
  provider: string;
  external_project_name: string | null;
  conversation_id: string | null;
  title: string | null;
  created_at: string;
}

interface ChatSnapshotRow {
  id: string;
  chat_source_id: string;
  content_hash: string;
  captured_at: string;
}

interface ChatMessageRow {
  snapshot_id: string;
  ordinal: number;
  role: string;
  content: string;
}

export interface ChatArchiveSummary {
  sourceId: string;
  conversationId: string;
  revisionCount: number;
  latestMessageCount: number;
  latestContentHash: string;
  latestMessages: { ordinal: number; role: string; text: string }[];
  lastSyncedAt: string;
}

export interface ChatHistoryExport {
  schemaVersion: '1.0';
  exportedAt: string;
  projectId: string;
  conversations: {
    source: {
      id: string;
      provider: string;
      conversationId: string;
      title: string;
      externalProjectName?: string;
      createdAt: string;
    };
    revisions: {
      capturedAt: string;
      contentHash: string;
      messages: { role: string; text: string }[];
    }[];
  }[];
}

function requireConversationId(value: string): string {
  const conversationId = value.trim();
  if (!conversationId || conversationId.length > 256) {
    throw new Error('CHAT_ARCHIVE_DESTINATION_REQUIRED');
  }
  return conversationId;
}

function validateSnapshot(input: ConversationSnapshot): ConversationSnapshot {
  const snapshot = conversationSnapshotSchema.parse(input);
  if (snapshot.messages.length === 0) throw new Error('CHAT_ARCHIVE_EMPTY');
  if (snapshot.messages.length > MAX_ARCHIVE_MESSAGES) {
    throw new Error('CHAT_ARCHIVE_TOO_LARGE');
  }
  let totalCharacters = 0;
  for (const message of snapshot.messages) {
    if (!CHAT_ROLE_PATTERN.test(message.role)) throw new Error('CHAT_ARCHIVE_INVALID');
    if (message.text.length > MAX_ARCHIVE_MESSAGE_CHARACTERS) {
      throw new Error('CHAT_ARCHIVE_TOO_LARGE');
    }
    totalCharacters += message.text.length;
    if (totalCharacters > MAX_ARCHIVE_TOTAL_CHARACTERS) {
      throw new Error('CHAT_ARCHIVE_TOO_LARGE');
    }
  }
  const canonicalHash = createHash('sha256')
    .update(
      JSON.stringify({
        title: snapshot.title,
        ...(snapshot.projectName ? { projectName: snapshot.projectName } : {}),
        messages: snapshot.messages,
      }),
    )
    .digest('hex');
  // Recompute the browser-supplied hash at the trust boundary before deduplication.
  return { ...snapshot, contentHash: canonicalHash };
}

export class ChatArchiveStore {
  public constructor(
    private readonly database: SqliteDatabase,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = randomUUID,
  ) {}

  public archive(input: {
    projectId: string;
    conversationId: string;
    snapshot: ConversationSnapshot;
  }): ChatArchiveSummary {
    const conversationId = requireConversationId(input.conversationId);
    const snapshot = validateSnapshot(input.snapshot);
    const syncedAt = this.now();

    return this.database.transaction(() => {
      let source = this.database
        .prepare(
          `SELECT * FROM chat_sources
           WHERE project_id = ? AND provider = 'chatgpt' AND conversation_id = ?
           ORDER BY created_at, id LIMIT 1`,
        )
        .get(input.projectId, conversationId) as ChatSourceRow | undefined;
      if (!source) {
        const sourceId = this.createId();
        this.database
          .prepare(
            `INSERT INTO chat_sources (
              id, project_id, provider, external_project_name, conversation_id, title, created_at
            ) VALUES (?, ?, 'chatgpt', ?, ?, ?, ?)`,
          )
          .run(
            sourceId,
            input.projectId,
            snapshot.projectName ?? null,
            conversationId,
            snapshot.title,
            syncedAt,
          );
        source = this.database.prepare('SELECT * FROM chat_sources WHERE id = ?').get(sourceId) as
          ChatSourceRow | undefined;
      } else {
        this.database
          .prepare(`UPDATE chat_sources SET external_project_name = ?, title = ? WHERE id = ?`)
          .run(snapshot.projectName ?? null, snapshot.title, source.id);
      }
      if (!source) throw new Error('CHAT_ARCHIVE_WRITE_FAILED');

      const existing = this.database
        .prepare('SELECT id FROM chat_snapshots WHERE chat_source_id = ? AND content_hash = ?')
        .get(source.id, snapshot.contentHash) as { id: string } | undefined;
      if (!existing) {
        const snapshotId = this.createId();
        this.database
          .prepare(
            `INSERT INTO chat_snapshots (id, chat_source_id, content_hash, captured_at)
             VALUES (?, ?, ?, ?)`,
          )
          .run(snapshotId, source.id, snapshot.contentHash, syncedAt);
        const insertMessage = this.database.prepare(
          `INSERT INTO chat_messages (id, snapshot_id, ordinal, role, content)
           VALUES (?, ?, ?, ?, ?)`,
        );
        snapshot.messages.forEach((message, ordinal) => {
          insertMessage.run(this.createId(), snapshotId, ordinal, message.role, message.text);
        });
      }

      return this.summary(source.id, conversationId, syncedAt);
    })();
  }

  public exportProject(projectId: string): ChatHistoryExport {
    const sources = this.database
      .prepare(
        `SELECT * FROM chat_sources
         WHERE project_id = ? AND provider = 'chatgpt'
         ORDER BY created_at, id`,
      )
      .all(projectId) as ChatSourceRow[];
    const conversations = sources.flatMap((source) => {
      if (!source.conversation_id) return [];
      const snapshots = this.database
        .prepare(
          `SELECT * FROM chat_snapshots
           WHERE chat_source_id = ? ORDER BY captured_at, rowid`,
        )
        .all(source.id) as ChatSnapshotRow[];
      const revisions = snapshots.map((snapshot) => ({
        capturedAt: snapshot.captured_at,
        contentHash: snapshot.content_hash,
        messages: (
          this.database
            .prepare(
              `SELECT snapshot_id, ordinal, role, content FROM chat_messages
               WHERE snapshot_id = ? ORDER BY ordinal`,
            )
            .all(snapshot.id) as ChatMessageRow[]
        ).map((message) => ({ role: message.role, text: message.content })),
      }));
      return [
        {
          source: {
            id: source.id,
            provider: source.provider,
            conversationId: source.conversation_id,
            title: source.title ?? 'Untitled conversation',
            ...(source.external_project_name
              ? { externalProjectName: source.external_project_name }
              : {}),
            createdAt: source.created_at,
          },
          revisions,
        },
      ];
    });
    return {
      schemaVersion: '1.0',
      exportedAt: this.now(),
      projectId,
      conversations,
    };
  }

  private summary(
    sourceId: string,
    conversationId: string,
    lastSyncedAt?: string,
  ): ChatArchiveSummary {
    const revision = this.database
      .prepare(
        `SELECT id, content_hash, captured_at FROM chat_snapshots
         WHERE chat_source_id = ? ORDER BY captured_at DESC, rowid DESC LIMIT 1`,
      )
      .get(sourceId) as ChatSnapshotRow | undefined;
    if (!revision) throw new Error('CHAT_ARCHIVE_WRITE_FAILED');
    const revisionCount = this.database
      .prepare('SELECT COUNT(*) AS count FROM chat_snapshots WHERE chat_source_id = ?')
      .get(sourceId) as { count: number };
    const messageCount = this.database
      .prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE snapshot_id = ?')
      .get(revision.id) as { count: number };
    const latestMessages = this.database
      .prepare(
        `SELECT ordinal, role, content FROM chat_messages
         WHERE snapshot_id = ? ORDER BY ordinal`,
      )
      .all(revision.id) as { ordinal: number; role: string; content: string }[];
    return {
      sourceId,
      conversationId,
      revisionCount: revisionCount.count,
      latestMessageCount: messageCount.count,
      latestContentHash: revision.content_hash,
      latestMessages: latestMessages.map((message) => ({
        ordinal: message.ordinal,
        role: message.role,
        text: message.content,
      })),
      lastSyncedAt: lastSyncedAt ?? revision.captured_at,
    };
  }
}
