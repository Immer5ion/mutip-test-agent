import { z } from "zod";

export const RunStatusSchema = z.enum([
  "queued",
  "planning",
  "generating",
  "executing",
  "healing",
  "learning",
  "completed",
  "failed"
]);

export const StepActionSchema = z.enum([
  "navigate",
  "click",
  "input",
  "assert",
  "wait",
  "custom"
]);

export const TestPlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  action: StepActionSchema,
  target: z.string().optional(),
  value: z.string().optional(),
  assertion: z.string().optional()
});

export const TestPlanSchema = z.object({
  objective: z.string(),
  targetUrl: z.string().url().optional(),
  steps: z.array(TestPlanStepSchema).min(1)
});

export const RunSchema = z.object({
  id: z.string(),
  requirement: z.string(),
  targetUrl: z.string().url().optional(),
  constraints: z.record(z.any()).default({}),
  status: RunStatusSchema,
  retryBudget: z.number().int().min(0).max(10),
  plan: TestPlanSchema.optional(),
  generatedScript: z.string().optional(),
  lastError: z.string().optional(),
  report: z.record(z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const RunStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  phase: z.string(),
  status: z.enum(["started", "completed", "failed"]),
  detail: z.record(z.any()).default({}),
  createdAt: z.string()
});

export const AgentDecisionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agent: z.enum(["planner", "codegen", "self-heal", "learning"]),
  input: z.record(z.any()).default({}),
  output: z.record(z.any()).default({}),
  reason: z.string(),
  createdAt: z.string()
});

export const PatchTypeSchema = z.enum(["locator", "timing", "assertion", "flow", "unknown"]);

export const PatchAttemptSchema = z.object({
  id: z.string(),
  runId: z.string(),
  attemptNo: z.number().int().min(1),
  failureSignature: z.object({
    type: PatchTypeSchema,
    reason: z.string()
  }),
  candidatePatches: z.array(
    z.object({
      id: z.string(),
      type: PatchTypeSchema,
      description: z.string(),
      score: z.number()
    })
  ),
  applyDecision: z.object({
    patchId: z.string(),
    patchType: PatchTypeSchema,
    success: z.boolean(),
    notes: z.string().optional()
  }),
  retryBudget: z.number().int().min(0).max(10),
  createdAt: z.string()
});

export const KnowledgeDocSchema = z.object({
  id: z.string(),
  runId: z.string().optional(),
  kind: z.enum(["history", "failure", "patch", "plan", "script"]),
  content: z.string(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.string()
});

export const CreateRunRequestSchema = z.object({
  requirement: z.string().min(5),
  targetUrl: z.string().url().optional(),
  constraints: z.record(z.any()).default({}),
  retryBudget: z.number().int().min(0).max(10).optional()
});

export const CreateRunResponseSchema = z.object({
  run: RunSchema
});

export const RunDetailResponseSchema = z.object({
  run: RunSchema,
  steps: z.array(RunStepSchema),
  decisions: z.array(AgentDecisionSchema),
  patches: z.array(PatchAttemptSchema)
});

export const SkillsConfigSchema = z.object({
  locatorStrategies: z.array(z.string()),
  assertionStrategies: z.array(z.string()),
  stabilityRules: z.object({
    defaultWaitMs: z.number().int().min(100).max(10000),
    maxRetriesPerStep: z.number().int().min(0).max(10)
  }),
  selfHeal: z.object({
    enableRuleHealing: z.boolean(),
    enableFlowHealing: z.boolean()
  })
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type StepAction = z.infer<typeof StepActionSchema>;
export type TestPlanStep = z.infer<typeof TestPlanStepSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type Run = z.infer<typeof RunSchema>;
export type RunStep = z.infer<typeof RunStepSchema>;
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type PatchAttempt = z.infer<typeof PatchAttemptSchema>;
export type PatchType = z.infer<typeof PatchTypeSchema>;
export type KnowledgeDoc = z.infer<typeof KnowledgeDocSchema>;
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;
export type RunDetailResponse = z.infer<typeof RunDetailResponseSchema>;
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

