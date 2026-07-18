ALTER TABLE workflow_runs ADD COLUMN max_iterations INTEGER NOT NULL DEFAULT 5;
ALTER TABLE workflow_runs ADD COLUMN max_failure_retries INTEGER NOT NULL DEFAULT 2;
ALTER TABLE workflow_runs ADD COLUMN recovery_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE workflow_runs ADD COLUMN last_error_code TEXT;

ALTER TABLE workflow_events ADD COLUMN actor TEXT NOT NULL DEFAULT 'system';
ALTER TABLE workflow_events ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE user_approvals ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE user_approvals ADD COLUMN scope TEXT;
ALTER TABLE user_approvals ADD COLUMN destination_type TEXT;
ALTER TABLE user_approvals ADD COLUMN destination_id TEXT;
ALTER TABLE user_approvals ADD COLUMN payload_hash TEXT;

CREATE TABLE workflow_effects (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN ('send_chatgpt', 'send_codex')),
  idempotency_key TEXT NOT NULL UNIQUE,
  handoff_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  destination_type TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  approval_id TEXT NOT NULL REFERENCES user_approvals(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('prepared', 'dispatching', 'acknowledged', 'failed')),
  result_json TEXT,
  prepared_at TEXT NOT NULL,
  dispatch_started_at TEXT,
  acknowledged_at TEXT,
  failed_at TEXT,
  UNIQUE(workflow_run_id, operation, handoff_hash, destination_type, destination_id)
);

CREATE INDEX workflow_effects_recovery_idx
  ON workflow_effects(workflow_run_id, status, prepared_at);
CREATE INDEX approvals_validation_idx
  ON user_approvals(workflow_run_id, project_id, scope, destination_type, destination_id, payload_hash);
