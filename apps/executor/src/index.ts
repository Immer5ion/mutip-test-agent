import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { chromium, Page } from "playwright";
import { z } from "zod";

dotenv.config();

const logger = pino({
  name: "executor",
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  pinoHttp({
    logger
  })
);

const ExecuteRequestSchema = z.object({
  runId: z.string(),
  attemptNo: z.number().int().min(0),
  targetUrl: z.string().url().optional(),
  requirement: z.string(),
  script: z.string()
});

const ignoreHttpsErrors = (process.env.IGNORE_HTTPS_ERRORS ?? "true").toLowerCase() === "true";
const autoDowngradeHttpsOnCertError =
  (process.env.AUTO_DOWNGRADE_HTTPS_ON_CERT_ERROR ?? "true").toLowerCase() === "true";

type HelperContext = {
  runId: string;
  attemptNo: number;
  screenshots: string[];
  logs: string[];
};

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

function artifactDir(runId: string, attemptNo: number): string {
  return path.resolve(process.cwd(), "apps", "executor", "artifacts", runId, `${attemptNo}`);
}

async function capture(page: Page, ctx: HelperContext, label: string): Promise<void> {
  const file = path.join(artifactDir(ctx.runId, ctx.attemptNo), `${Date.now()}-${sanitize(label)}.png`);
  await page.screenshot({ path: file, fullPage: true });
  ctx.screenshots.push(file);
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 32) || "step";
}

async function buildHelpers(page: Page, ctx: HelperContext) {
  return {
    logStep: async (message: string) => {
      ctx.logs.push(message);
    },
    captureStep: async (_page: Page, label: string) => {
      await capture(page, ctx, label);
    },
    gotoSafe: async (_page: Page, url?: string) => {
      if (!url) {
        throw new Error("Missing target URL");
      }
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
      } catch (error) {
        const message = ((error as Error).message ?? "").toLowerCase();
        if (
          autoDowngradeHttpsOnCertError &&
          url.startsWith("https://") &&
          (message.includes("err_cert") || message.includes("certificate") || message.includes("ssl"))
        ) {
          const fallbackUrl = url.replace(/^https:\/\//i, "http://");
          ctx.logs.push(`certificate_error_auto_downgrade:${url}=>${fallbackUrl}`);
          await page.goto(fallbackUrl, { waitUntil: "domcontentloaded" });
        } else {
          throw error;
        }
      }
      await capture(page, ctx, "goto");
    },
    waitStable: async (_page: Page, ms = 800) => {
      await page.waitForTimeout(ms);
    },
    clickByText: async (_page: Page, text: string) => {
      const candidate = page.getByRole("button", { name: text }).first();
      try {
        await candidate.click({ timeout: 4000 });
      } catch {
        await page.getByText(text, { exact: false }).first().click({ timeout: 4000 });
      }
      await capture(page, ctx, `click-${text}`);
    },
    clickWithFallback: async (_page: Page, text: string) => {
      try {
        await page.getByLabel(text).first().click({ timeout: 2500 });
      } catch {
        try {
          await page.locator(`text=${text}`).first().click({ timeout: 2500 });
        } catch {
          await page.getByText(text, { exact: false }).first().click({ timeout: 2500 });
        }
      }
      await capture(page, ctx, `click-fallback-${text}`);
    },
    fillByLabelOrPlaceholder: async (_page: Page, field: string, value: string) => {
      try {
        await page.getByLabel(field, { exact: false }).first().fill(value);
      } catch {
        try {
          await page.getByPlaceholder(field).first().fill(value);
        } catch {
          const fallback = page.locator(`input[name*="${field}" i],textarea[name*="${field}" i]`).first();
          await fallback.fill(value);
        }
      }
      await capture(page, ctx, `fill-${field}`);
    },
    assertTextVisible: async (_page: Page, text: string) => {
      const locator = page.getByText(text, { exact: false }).first();
      await locator.waitFor({ state: "visible", timeout: 5000 });
    },
    assertTextContainsLoose: async (_page: Page, text: string) => {
      const pageText = await page.textContent("body");
      if (!pageText?.toLowerCase().includes(text.toLowerCase())) {
        throw new Error(`Loose assertion failed for: ${text}`);
      }
    },
    ensureAtUrl: async (_page: Page, url: string) => {
      if (!url) {
        return;
      }
      const current = page.url();
      if (!current || !current.includes(new URL(url).hostname)) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
      }
      await capture(page, ctx, "ensure-url");
    },
    refreshAndWait: async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await capture(page, ctx, "refresh");
    }
  };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "executor",
    time: new Date().toISOString()
  });
});

app.get("/mcp/health", (_req, res) => {
  res.json({
    ok: true,
    service: "playwright-mcp-adapter",
    time: new Date().toISOString()
  });
});

async function executeHandler(req: express.Request, res: express.Response): Promise<void> {
  const parsed = ExecuteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      detail: parsed.error.flatten()
    });
    return;
  }

  const payload = parsed.data;
  const startedAt = new Date().toISOString();
  const ctx: HelperContext = {
    runId: payload.runId,
    attemptNo: payload.attemptNo,
    logs: [],
    screenshots: []
  };

  await ensureDir(artifactDir(payload.runId, payload.attemptNo));

  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({
    ignoreHTTPSErrors: ignoreHttpsErrors
  });
  await browserContext.tracing.start({ screenshots: true, snapshots: true });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(15000);

  try {
    const helpers = await buildHelpers(page, ctx);
    // eslint-disable-next-line no-new-func
    const execute = new Function(
      "page",
      "helpers",
      "ctx",
      `return (async () => { ${payload.script} })();`
    ) as (page: Page, helpers: Awaited<ReturnType<typeof buildHelpers>>, ctx: { targetUrl?: string }) => Promise<void>;
    await execute(page, helpers, { targetUrl: payload.targetUrl });

    const tracePath = path.join(artifactDir(payload.runId, payload.attemptNo), "trace.zip");
    await browserContext.tracing.stop({ path: tracePath });
    await browser.close();

    res.json({
      passed: true,
      startedAt,
      endedAt: new Date().toISOString(),
      logs: ctx.logs,
      screenshots: ctx.screenshots,
      tracePath
    });
  } catch (error) {
    const tracePath = path.join(artifactDir(payload.runId, payload.attemptNo), "trace.zip");
    await browserContext.tracing.stop({ path: tracePath });
    await browser.close();
    res.json({
      passed: false,
      startedAt,
      endedAt: new Date().toISOString(),
      logs: ctx.logs,
      screenshots: ctx.screenshots,
      tracePath,
      error: (error as Error).stack ?? (error as Error).message
    });
  }
}

app.post("/execute", executeHandler);
app.post("/mcp/execute", executeHandler);

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
app.listen(port, () => {
  logger.info(
    {
      port,
      ignoreHttpsErrors,
      autoDowngradeHttpsOnCertError
    },
    "Executor started"
  );
});
