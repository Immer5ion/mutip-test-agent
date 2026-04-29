import { AgentDecision, KnowledgeDoc, PatchAttempt, Run, RunStep } from "@agent/contracts";
import { Pool } from "pg";
import { logger } from "../logger";

export class PostgresSync {
  private readonly pool?: Pool;

  constructor(databaseUrl?: string) {
    if (!databaseUrl) {
      return;
    }
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  isEnabled(): boolean {
    return Boolean(this.pool);
  }

  async initialize(): Promise<void> {
    if (!this.pool) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector");
      await client.query(`
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
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS run_steps (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          phase TEXT NOT NULL,
          status TEXT NOT NULL,
          detail JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_decisions (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
          agent TEXT NOT NULL,
          input JSONB NOT NULL DEFAULT '{}'::jsonb,
          output JSONB NOT NULL DEFAULT '{}'::jsonb,
          reason TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await client.query(`
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
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS knowledge_docs (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          kind TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          embedding VECTOR(1536),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      logger.info("Postgres persistence initialized");
    } catch (error) {
      logger.error({ error }, "Failed to initialize Postgres persistence");
    } finally {
      client.release();
    }
  }

  async upsertRun(run: Run): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(
      `
      INSERT INTO runs (
        id, requirement, target_url, constraints, status, retry_budget, plan, generated_script, last_error, report, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        requirement = EXCLUDED.requirement,
        target_url = EXCLUDED.target_url,
        constraints = EXCLUDED.constraints,
        status = EXCLUDED.status,
        retry_budget = EXCLUDED.retry_budget,
        plan = EXCLUDED.plan,
        generated_script = EXCLUDED.generated_script,
        last_error = EXCLUDED.last_error,
        report = EXCLUDED.report,
        updated_at = EXCLUDED.updated_at
      `,
      [
        run.id,
        run.requirement,
        run.targetUrl ?? null,
        run.constraints,
        run.status,
        run.retryBudget,
        run.plan ?? null,
        run.generatedScript ?? null,
        run.lastError ?? null,
        run.report ?? null,
        run.createdAt,
        run.updatedAt
      ]
    );
  }

  async insertRunStep(step: RunStep): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(
      `INSERT INTO run_steps (id, run_id, phase, status, detail, created_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [step.id, step.runId, step.phase, step.status, step.detail, step.createdAt]
    );
  }

  async insertDecision(decision: AgentDecision): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(
      `INSERT INTO agent_decisions (id, run_id, agent, input, output, reason, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO NOTHING`,
      [
        decision.id,
        decision.runId,
        decision.agent,
        decision.input,
        decision.output,
        decision.reason,
        decision.createdAt
      ]
    );
  }

  async insertPatch(patch: PatchAttempt): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(
      `INSERT INTO patch_attempts (id, run_id, attempt_no, failure_signature, candidate_patches, apply_decision, retry_budget, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        patch.id,
        patch.runId,
        patch.attemptNo,
        patch.failureSignature,
        patch.candidatePatches,
        patch.applyDecision,
        patch.retryBudget,
        patch.createdAt
      ]
    );
  }

  async insertKnowledge(doc: KnowledgeDoc): Promise<void> {
    if (!this.pool) {
      return;
    }
    await this.pool.query(
      `INSERT INTO knowledge_docs (id, run_id, kind, content, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [doc.id, doc.runId ?? null, doc.kind, doc.content, doc.metadata, doc.createdAt]
    );
  }
}

