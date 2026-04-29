import { RunDetailResponse } from "@agent/contracts";

export class ReportService {
  toJson(detail: RunDetailResponse): Record<string, unknown> {
    const lastExecutionStep = detail.steps
      .filter((step) => step.phase === "execution")
      .at(-1);

    return {
      runId: detail.run.id,
      status: detail.run.status,
      requirement: detail.run.requirement,
      targetUrl: detail.run.targetUrl,
      createdAt: detail.run.createdAt,
      updatedAt: detail.run.updatedAt,
      summary: {
        passed: detail.run.status === "completed",
        retries: detail.patches.length,
        lastError: detail.run.lastError ?? null
      },
      execution: lastExecutionStep?.detail ?? {},
      timeline: detail.steps,
      decisions: detail.decisions,
      patchAttempts: detail.patches
    };
  }

  toHtml(detail: RunDetailResponse): string {
    const report = this.toJson(detail);
    const summary = report.summary as {
      passed: boolean;
      retries: number;
      lastError: string | null;
    };
    const timelineRows = detail.steps
      .map(
        (step) =>
          `<tr><td>${step.createdAt}</td><td>${step.phase}</td><td>${step.status}</td><td><pre>${escapeHtml(
            JSON.stringify(step.detail, null, 2)
          )}</pre></td></tr>`
      )
      .join("");

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Run Report ${detail.run.id}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #14213d; background: #f7f9fc; }
    h1, h2 { margin-top: 0; }
    .card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 4px 18px rgba(0,0,0,0.08); }
    .ok { color: #0f9d58; font-weight: 700; }
    .bad { color: #d93025; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #dde3ed; padding: 8px; vertical-align: top; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Playwright Multi-Agent Report</h1>
    <p><strong>Run ID:</strong> ${detail.run.id}</p>
    <p><strong>Status:</strong> <span class="${summary.passed ? "ok" : "bad"}">${detail.run.status}</span></p>
    <p><strong>Requirement:</strong> ${escapeHtml(detail.run.requirement)}</p>
    <p><strong>Retries:</strong> ${summary.retries}</p>
    <p><strong>Last Error:</strong> ${escapeHtml(summary.lastError ?? "None")}</p>
  </div>
  <div class="card">
    <h2>Timeline</h2>
    <table>
      <thead><tr><th>Time</th><th>Phase</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${timelineRows}</tbody>
    </table>
  </div>
</body>
</html>`;
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

