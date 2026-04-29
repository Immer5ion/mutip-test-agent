import { defaultSkillsConfig, RunStatus, TestPlan } from "@agent/contracts";
import { AppConfig } from "../config";
import { CodeGenAgent } from "../agents/codegen-agent";
import { LearningAgent } from "../agents/learning-agent";
import { PlannerAgent } from "../agents/planner-agent";
import { SelfHealAgent } from "../agents/self-heal-agent";
import { logger } from "../logger";
import { RunStore } from "../store/run-store";
import { ExecuteResponse, ExecutorClient } from "./executor-client";
import { HttpLlmClient } from "./llm-client";
import { ReportService } from "./report-service";

export class PipelineService {
  private readonly plannerAgent: PlannerAgent;
  private readonly codeGenAgent: CodeGenAgent;
  private readonly selfHealAgent: SelfHealAgent;
  private readonly learningAgent: LearningAgent;
  private readonly executorClient: ExecutorClient;
  private readonly reportService: ReportService;
  private readonly inflight = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly store: RunStore
  ) {
    const llmClient = new HttpLlmClient({
      apiUrl: config.llmApiUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
      thinkingEnabled: config.llmThinkingEnabled,
      stream: config.llmStream,
      maxTokens: config.llmMaxTokens,
      temperature: config.llmTemperature,
      timeoutMs: config.llmTimeoutMs,
      retryCount: config.llmRetryCount,
      minIntervalMs: config.llmMinIntervalMs
    });

    this.plannerAgent = new PlannerAgent({
      llmClient
    });
    this.codeGenAgent = new CodeGenAgent({
      llmClient
    });
    this.selfHealAgent = new SelfHealAgent();
    this.learningAgent = new LearningAgent(this.store);
    this.executorClient = new ExecutorClient(config.executorBaseUrl);
    this.reportService = new ReportService();
  }

  enqueue(runId: string): void {
    if (this.inflight.has(runId)) {
      return;
    }
    this.inflight.add(runId);
    setImmediate(async () => {
      try {
        await this.execute(runId);
      } catch (error) {
        logger.error({ runId, error }, "Pipeline crashed");
      } finally {
        this.inflight.delete(runId);
      }
    });
  }

  private transition(runId: string, status: RunStatus, detail: Record<string, unknown>): void {
    this.store.updateRun(runId, { status });
    this.store.addStep({
      runId,
      phase: status,
      status: "started",
      detail
    });
  }

  private completePhase(runId: string, phase: string, detail: Record<string, unknown>): void {
    this.store.addStep({
      runId,
      phase,
      status: "completed",
      detail
    });
  }

  private failPhase(runId: string, phase: string, detail: Record<string, unknown>): void {
    this.store.addStep({
      runId,
      phase,
      status: "failed",
      detail
    });
  }

  private async execute(runId: string): Promise<void> {
    const run = this.store.getRun(runId);
    if (!run) {
      return;
    }
    logger.info({ runId }, "Run execution started");

    let plan: TestPlan;
    this.transition(runId, "planning", { message: "planner_started" });
    try {
      const knowledge = this.store.searchKnowledge(run.requirement, 3);
      const planned = await this.plannerAgent.plan({
        requirement: run.requirement,
        targetUrl: run.targetUrl,
        knowledge
      });
      plan = planned.plan;
      this.store.updateRun(runId, { plan });
      this.store.addDecision({
        runId,
        agent: "planner",
        input: {
          requirement: run.requirement,
          targetUrl: run.targetUrl,
          knowledgeCount: knowledge.length
        },
        output: plan,
        reason: planned.reason
      });
      this.completePhase(runId, "planning", { plan });
    } catch (error) {
      this.failPhase(runId, "planning", { error: (error as Error).message });
      this.store.updateRun(runId, {
        status: "failed",
        lastError: (error as Error).message
      });
      return;
    }

    this.transition(runId, "generating", { message: "codegen_started" });
    let script: string;
    try {
      const knowledge = this.store.searchKnowledge(run.requirement, 3);
      const generated = await this.codeGenAgent.generate({ plan, knowledge });
      script = generated.script;
      this.store.updateRun(runId, { generatedScript: script });
      this.store.addDecision({
        runId,
        agent: "codegen",
        input: { plan, knowledgeCount: knowledge.length },
        output: {
          scriptPreview: script.slice(0, 800)
        },
        reason: generated.reason
      });
      this.completePhase(runId, "generating", { scriptSize: script.length });
    } catch (error) {
      this.failPhase(runId, "generating", { error: (error as Error).message });
      this.store.updateRun(runId, {
        status: "failed",
        lastError: (error as Error).message
      });
      return;
    }

    let finalExecution: ExecuteResponse | undefined;
    let finalScript = script;
    let lastError = "";

    this.transition(runId, "executing", { message: "execution_started" });
    try {
      const execution = await this.executorClient.execute({
        runId,
        attemptNo: 0,
        requirement: run.requirement,
        targetUrl: plan.targetUrl ?? run.targetUrl,
        script: finalScript
      });
      finalExecution = execution;
      this.completePhase(runId, "execution", execution as unknown as Record<string, unknown>);
    } catch (error) {
      const message = (error as Error).message;
      lastError = message;
      this.failPhase(runId, "execution", { error: message });
    }

    if (!finalExecution?.passed && this.config.selfHealEnabled) {
      this.transition(runId, "healing", { message: "self_heal_started" });
      const retryBudget = run.retryBudget;
      let currentScript = finalScript;
      for (let attemptNo = 1; attemptNo <= retryBudget; attemptNo += 1) {
        const signature = this.selfHealAgent.classify(finalExecution?.error ?? lastError);
        const candidates = this.selfHealAgent.generateCandidates(signature, {
          flowHealingEnabled: defaultSkillsConfig.selfHeal.enableFlowHealing && this.config.flowHealEnabled
        });
        const patchResult = this.selfHealAgent.applyBestPatch({
          script: currentScript,
          targetUrl: plan.targetUrl ?? run.targetUrl,
          candidates
        });

        this.store.addDecision({
          runId,
          agent: "self-heal",
          input: {
            attemptNo,
            signature,
            candidateCount: candidates.length
          },
          output: {
            chosenPatch: patchResult.chosenPatch,
            validation: patchResult.validation
          },
          reason: "rule_and_flow_heal"
        });

        this.store.addPatchAttempt({
          runId,
          attemptNo,
          failureSignature: signature,
          candidatePatches: candidates.map((item) => ({
            id: item.id,
            type: item.type,
            description: item.description,
            score: item.score
          })),
          applyDecision: {
            patchId: patchResult.chosenPatch.id,
            patchType: patchResult.chosenPatch.type,
            success: patchResult.validation.valid,
            notes: patchResult.validation.error
          },
          retryBudget
        });

        if (!patchResult.validation.valid) {
          lastError = patchResult.validation.error ?? "Patch compile failed";
          continue;
        }

        currentScript = patchResult.patchedScript;
        this.store.updateRun(runId, { generatedScript: currentScript });
        try {
          const execution = await this.executorClient.execute({
            runId,
            attemptNo,
            requirement: run.requirement,
            targetUrl: plan.targetUrl ?? run.targetUrl,
            script: currentScript
          });
          finalExecution = execution;
          this.completePhase(runId, "healing", {
            attemptNo,
            passed: execution.passed,
            error: execution.error
          });
          if (execution.passed) {
            finalScript = currentScript;
            break;
          }
          lastError = execution.error ?? "Unknown execution error";
        } catch (error) {
          lastError = (error as Error).message;
          this.failPhase(runId, "healing", {
            attemptNo,
            error: lastError
          });
        }
      }
    }

    this.transition(runId, "learning", { message: "learning_started" });
    const detail = this.store.getRunDetail(runId);
    if (!detail) {
      this.store.updateRun(runId, {
        status: "failed",
        lastError: "Run detail missing"
      });
      return;
    }

    this.learningAgent.ingest(detail);
    this.completePhase(runId, "learning", { message: "knowledge_updated" });

    const refreshedDetail = this.store.getRunDetail(runId);
    if (!refreshedDetail) {
      this.store.updateRun(runId, {
        status: "failed",
        lastError: "Run detail missing after learning"
      });
      return;
    }

    const passed = Boolean(finalExecution?.passed);
    const reportPayload = this.reportService.toJson({
      ...refreshedDetail,
      run: {
        ...refreshedDetail.run,
        generatedScript: finalScript
      }
    });

    this.store.updateRun(runId, {
      status: passed ? "completed" : "failed",
      report: reportPayload,
      lastError: passed ? undefined : ((finalExecution?.error ?? lastError) || "Execution failed")
    });
    logger.info({ runId, passed }, "Run execution completed");
  }
}
