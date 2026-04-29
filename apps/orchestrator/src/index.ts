import { createApp } from "./app";
import { config } from "./config";
import { logger } from "./logger";

const app = createApp(config);

app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      executorBaseUrl: config.executorBaseUrl,
      llmApiUrl: config.llmApiUrl,
      llmModel: config.llmModel,
      llmConfigured: Boolean(config.llmApiKey),
      llmStream: config.llmStream,
      llmTimeoutMs: config.llmTimeoutMs,
      llmRetryCount: config.llmRetryCount,
      llmMinIntervalMs: config.llmMinIntervalMs,
      selfHealEnabled: config.selfHealEnabled,
      flowHealEnabled: config.flowHealEnabled
    },
    "Orchestrator started"
  );
});
