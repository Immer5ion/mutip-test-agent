import {
  CreateRunRequestSchema,
  CreateRunResponseSchema
} from "@agent/contracts";
import express from "express";
import path from "node:path";
import { AppConfig } from "./config";
import { httpLogger, logger } from "./logger";
import { PostgresSync } from "./store/postgres-sync";
import { RunStore } from "./store/run-store";
import { PipelineService } from "./services/pipeline-service";
import { ReportService } from "./services/report-service";

export function createApp(config: AppConfig): express.Express {
  const app = express();
  const postgresSync = new PostgresSync(config.databaseUrl);
  const store = new RunStore(postgresSync);
  const pipeline = new PipelineService(config, store);
  const reportService = new ReportService();

  void store.initialize();

  app.use(express.json({ limit: "1mb" }));
  app.use(httpLogger);
  app.use(express.static(path.resolve(__dirname, "../public")));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "orchestrator",
      time: new Date().toISOString()
    });
  });

  app.post("/v1/test-runs", (req, res) => {
    const parsed = CreateRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_request",
        detail: parsed.error.flatten()
      });
      return;
    }

    const run = store.createRun({
      ...parsed.data,
      retryBudget: parsed.data.retryBudget ?? config.defaultRetryBudget
    });
    const response = CreateRunResponseSchema.parse({ run });
    pipeline.enqueue(run.id);
    res.status(202).json(response);
  });

  app.get("/v1/test-runs/:id", (req, res) => {
    const detail = store.getRunDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    res.json(detail);
  });

  app.get("/v1/test-runs/:id/report", (req, res) => {
    const detail = store.getRunDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    const format = (req.query.format as string | undefined)?.toLowerCase() ?? "json";
    if (format === "html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.send(reportService.toHtml(detail));
      return;
    }
    const payload = detail.run.report ?? reportService.toJson(detail);
    res.json(payload);
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ error }, "Unhandled app error");
    res.status(500).json({
      error: "internal_error",
      message: error.message
    });
  });

  return app;
}
