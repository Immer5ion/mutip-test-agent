#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";

type RunDetail = {
  run: {
    id: string;
    status: string;
    requirement: string;
    lastError?: string;
  };
  steps: Array<{
    phase: string;
    status: string;
    createdAt: string;
  }>;
};

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function waitForRun(api: string, runId: string): Promise<RunDetail> {
  while (true) {
    const detail = (await getJson(`${api}/v1/test-runs/${runId}`)) as RunDetail;
    const status = detail.run.status;
    if (status === "completed" || status === "failed") {
      return detail;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

const program = new Command();
program.name("agent-test").description("Playwright multi-agent test runner");

program
  .command("run")
  .requiredOption("--requirement <text>", "Natural language requirement")
  .option("--url <targetUrl>", "Target web URL")
  .option("--retry-budget <n>", "Retry budget", "3")
  .option("--api <baseUrl>", "Orchestrator API base URL", "http://localhost:3000")
  .option("--wait", "Wait until finished", false)
  .action(async (options) => {
    const payload = {
      requirement: options.requirement,
      targetUrl: options.url,
      retryBudget: Number.parseInt(options.retryBudget, 10)
    };

    const created = (await postJson(`${options.api}/v1/test-runs`, payload)) as {
      run: { id: string };
    };
    const runId = created.run.id;
    process.stdout.write(`Run created: ${runId}\n`);

    if (options.wait) {
      const detail = await waitForRun(options.api, runId);
      process.stdout.write(`Run finished: ${detail.run.status}\n`);
      if (detail.run.lastError) {
        process.stdout.write(`Last error: ${detail.run.lastError}\n`);
      }
    }
  });

program
  .command("status")
  .argument("<id>", "Run ID")
  .option("--api <baseUrl>", "Orchestrator API base URL", "http://localhost:3000")
  .action(async (id, options) => {
    const detail = (await getJson(`${options.api}/v1/test-runs/${id}`)) as RunDetail;
    process.stdout.write(`${JSON.stringify(detail, null, 2)}\n`);
  });

program
  .command("report")
  .argument("<id>", "Run ID")
  .option("--api <baseUrl>", "Orchestrator API base URL", "http://localhost:3000")
  .option("--format <json|html>", "Report format", "json")
  .option("--output <file>", "Output file path")
  .action(async (id, options) => {
    if (options.format === "html") {
      const response = await fetch(`${options.api}/v1/test-runs/${id}/report?format=html`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${await response.text()}`);
      }
      const html = await response.text();
      if (options.output) {
        await fs.writeFile(options.output, html, "utf8");
        process.stdout.write(`HTML report written to ${options.output}\n`);
      } else {
        process.stdout.write(`${html}\n`);
      }
      return;
    }

    const payload = await getJson(`${options.api}/v1/test-runs/${id}/report`);
    if (options.output) {
      await fs.writeFile(options.output, JSON.stringify(payload, null, 2), "utf8");
      process.stdout.write(`JSON report written to ${options.output}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 1;
});

