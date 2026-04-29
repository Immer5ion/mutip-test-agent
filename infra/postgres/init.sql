CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  requirement TEXT NOT NULL,
  target_url TEXT,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  retry_budget INTEGER NOT NULL DEFAULT 3,
  plan JSONB,
  generated_script TEXT,
  last_error TEXT,
  report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patch_attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  failure_signature JSONB NOT NULL,
  candidate_patches JSONB NOT NULL,
  apply_decision JSONB NOT NULL,
  retry_budget INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_run_id ON agent_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_patch_attempts_run_id ON patch_attempts(run_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_kind ON knowledge_docs(kind);

