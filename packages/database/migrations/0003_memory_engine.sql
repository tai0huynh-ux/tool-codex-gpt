ALTER TABLE memories ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE memories ADD COLUMN content_hash TEXT;
ALTER TABLE memories ADD COLUMN superseded_by TEXT REFERENCES memories(id) ON DELETE SET NULL;

CREATE INDEX memories_retrieval_idx
  ON memories(status, scope, project_id, scope_id, updated_at);
CREATE UNIQUE INDEX memories_active_content_idx
  ON memories(scope, COALESCE(scope_id, ''), COALESCE(project_id, ''), content_hash)
  WHERE content_hash IS NOT NULL AND status IN ('candidate', 'approved');
CREATE INDEX memory_sources_memory_idx ON memory_sources(memory_id, source_type, source_id);
