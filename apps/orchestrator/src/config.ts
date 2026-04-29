import dotenv from "dotenv";

dotenv.config();

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toFloat(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  serviceName: "orchestrator",
  port: toInt(process.env.PORT, 3000),
  executorBaseUrl: process.env.EXECUTOR_BASE_URL ?? "http://localhost:3001",
  llmApiUrl: process.env.LLM_API_URL ?? "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  llmApiKey: process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY,
  llmModel: process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? "glm-4.7-flash",
  llmThinkingEnabled: (process.env.LLM_THINKING_ENABLED ?? "true").toLowerCase() === "true",
  llmStream: (process.env.LLM_STREAM ?? "false").toLowerCase() === "true",
  llmMaxTokens: toInt(process.env.LLM_MAX_TOKENS, 8192),
  llmTemperature: toFloat(process.env.LLM_TEMPERATURE, 1.0),
  llmTimeoutMs: toInt(process.env.LLM_TIMEOUT_MS, 45000),
  llmRetryCount: toInt(process.env.LLM_RETRY_COUNT, 4),
  llmMinIntervalMs: toInt(process.env.LLM_MIN_INTERVAL_MS, 1200),
  databaseUrl: process.env.DATABASE_URL,
  defaultRetryBudget: toInt(process.env.DEFAULT_RETRY_BUDGET, 3),
  selfHealEnabled: (process.env.SELF_HEAL_ENABLED ?? "true").toLowerCase() === "true",
  flowHealEnabled: (process.env.FLOW_HEAL_ENABLED ?? "true").toLowerCase() === "true",
  logLevel: process.env.LOG_LEVEL ?? "info"
};

export type AppConfig = typeof config;
