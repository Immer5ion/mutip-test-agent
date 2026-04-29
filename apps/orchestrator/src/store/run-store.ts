import {
  AgentDecision,
  AgentDecisionSchema,
  KnowledgeDoc,
  KnowledgeDocSchema,
  PatchAttempt,
  PatchAttemptSchema,
  Run,
  RunDetailResponse,
  RunDetailResponseSchema,
  RunSchema,
  RunStatus,
  RunStep,
  RunStepSchema,
  TestPlan
} from "@agent/contracts";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";
import { PostgresSync } from "./postgres-sync";

type RunRecord = {
  run: Run;
  steps: RunStep[];
  decisions: AgentDecision[];
  patches: PatchAttempt[];
};

export class RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly knowledge: KnowledgeDoc[] = [];
  constructor(private readonly postgresSync?: PostgresSync) {}

  async initialize(): Promise<void> {
    await this.postgresSync?.initialize();
  }

  private mirror(task: Promise<void>): void {
    void task.catch((error) => {
      logger.error({ error }, "Postgres mirror write failed");
    });
  }

  createRun(input: {
    requirement: string;
    targetUrl?: string;
    constraints?: Record<string, unknown>;
    retryBudget: number;
  }): Run {
    const now = new Date().toISOString();
    const run = RunSchema.parse({
      id: randomUUID(),
      requirement: input.requirement,
      targetUrl: input.targetUrl,
      constraints: input.constraints ?? {},
      status: "queued",
      retryBudget: input.retryBudget,
      createdAt: now,
      updatedAt: now
    });

    this.runs.set(run.id, {
      run,
      steps: [],
      decisions: [],
      patches: []
    });
    if (this.postgresSync?.isEnabled()) {
      this.mirror(this.postgresSync.upsertRun(run));
    }
    return run;
  }

  getRun(id: string): Run | undefined {
    return this.runs.get(id)?.run;
  }

  updateRun(
    id: string,
    patch: Partial<{
      status: RunStatus;
      plan: TestPlan;
      generatedScript: string;
      lastError: string;
      report: Record<string, unknown>;
    }>
  ): Run {
    const existing = this.runs.get(id);
    if (!existing) {
      throw new Error(`Run ${id} not found`);
    }
    const next = RunSchema.parse({
      ...existing.run,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    existing.run = next;
    if (this.postgresSync?.isEnabled()) {
      this.mirror(this.postgresSync.upsertRun(next));
    }
    return next;
  }

  addStep(input: Omit<RunStep, "id" | "createdAt">): RunStep {
    const existing = this.runs.get(input.runId);
    if (!existing) {
      throw new Error(`Run ${input.runId} not found`);
    }
    const step = RunStepSchema.parse({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    });
    existing.steps.push(step);
    if (this.postgresSync?.isEnabled()) {
      this.mirror(this.postgresSync.insertRunStep(step));
    }
    return step;
  }

  addDecision(input: Omit<AgentDecision, "id" | "createdAt">): AgentDecision {
    const existing = this.runs.get(input.runId);
    if (!existing) {
      throw new Error(`Run ${input.runId} not found`);
    }
    const decision = AgentDecisionSchema.parse({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    });
    existing.decisions.push(decision);
    if (this.postgresSync?.isEnabled()) {
      this.mirror(this.postgresSync.insertDecision(decision));
    }
    return decision;
  }

  addPatchAttempt(input: Omit<PatchAttempt, "id" | "createdAt">): PatchAttempt {
    const existing = this.runs.get(input.runId);
    if (!existing) {
      throw new Error(`Run ${input.runId} not found`);
    }
    const patch = PatchAttemptSchema.parse({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    });
    existing.patches.push(patch);
    if (this.postgresSync?.isEnabled()) {
      this.mirror(this.postgresSync.insertPatch(patch));
    }
    return patch;
  }

  addKnowledgeDoc(input: Omit<KnowledgeDoc, "id" | "createdAt">): KnowledgeDoc {
    const doc = KnowledgeDocSchema.parse({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    });
    this.knowledge.push(doc);
    if (this.postgresSync?.isEnabled()) {
      this.mirror(this.postgresSync.insertKnowledge(doc));
    }
    return doc;
  }

  searchKnowledge(query: string, limit = 3): KnowledgeDoc[] {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((item) => item.length > 1);
    if (tokens.length === 0) {
      return this.knowledge.slice(-limit);
    }
    return this.knowledge
      .map((doc) => {
        let score = 0;
        const text = `${doc.kind} ${doc.content}`.toLowerCase();
        for (const token of tokens) {
          if (text.includes(token)) {
            score += 1;
          }
        }
        return { score, doc };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.doc);
  }

  getRunDetail(id: string): RunDetailResponse | undefined {
    const existing = this.runs.get(id);
    if (!existing) {
      return undefined;
    }
    return RunDetailResponseSchema.parse({
      run: existing.run,
      steps: existing.steps,
      decisions: existing.decisions,
      patches: existing.patches
    });
  }
}
