ALTER TABLE projects ADD COLUMN archived_at TEXT;

ALTER TABLE repositories ADD COLUMN branch TEXT;
ALTER TABLE repositories ADD COLUMN worktree_root TEXT;
ALTER TABLE repositories ADD COLUMN updated_at TEXT;
ALTER TABLE repositories ADD COLUMN archived_at TEXT;

CREATE TABLE mapping_confirmations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_id TEXT REFERENCES repositories(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK(subject_type IN (
    'repository',
    'chat_project',
    'chat_conversation',
    'codex_thread'
  )),
  subject_id TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  evidence_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('confirmed', 'rejected', 'superseded')),
  created_at TEXT NOT NULL,
  superseded_at TEXT
);

CREATE INDEX mapping_confirmations_subject_idx
  ON mapping_confirmations(subject_type, subject_id, created_at);
CREATE INDEX mapping_confirmations_project_idx
  ON mapping_confirmations(project_id, created_at);
