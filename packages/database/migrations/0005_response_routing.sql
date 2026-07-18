CREATE TABLE chatgpt_response_receipts (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  handoff_id TEXT NOT NULL UNIQUE,
  correlation_id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  response_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('captured', 'routed')),
  created_at TEXT NOT NULL,
  routed_at TEXT,
  UNIQUE(workflow_run_id, response_hash)
);

CREATE INDEX chatgpt_response_receipts_workflow_idx
  ON chatgpt_response_receipts(workflow_run_id, status, created_at);
