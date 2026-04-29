# Playwright Multi-Agent Test System

一个可落地的 Playwright 自动化 Agent 框架，按“控制面 + 执行面 + 数据面”实现：

- 控制面（`apps/orchestrator`）：Planner / CodeGen / Self-Heal / Learning 4 类 Agent。
- 执行面（`apps/executor`）：Playwright 浏览器执行器，执行生成脚本并返回截图/日志/trace。
- 执行面（`apps/executor`）：Playwright 浏览器执行器（含 MCP 风格接口 `/mcp/execute`），执行生成脚本并返回截图/日志/trace。
- 数据面（`infra/postgres/init.sql`）：Run、步骤、决策、补丁、知识文档模型（含 pgvector 列）。

## 已实现能力

- `POST /v1/test-runs` 创建任务，异步执行。
- `GET /v1/test-runs/:id` 查询状态和阶段产物。
- `GET /v1/test-runs/:id/report?format=json|html` 获取报告。
- Web 页面：访问 `http://localhost:3000/`，可直接在 HTML 页面调用以上 API。
- CLI：
  - `agent-test run --requirement "..."`
  - `agent-test status <id>`
  - `agent-test report <id>`
- 自愈协议：
  - `failure_signature`
  - `candidate_patches`
  - `apply_decision`
  - `retry_budget`
- 规则修复 + 流程修复（可通过环境变量开关）

## Quick Start (Local)

```bash
npm install
npx playwright install chromium
npm run build
```

启动执行器：

```bash
npm run dev:executor
```

启动编排器：

```bash
npm run dev:orchestrator
```

打开浏览器页面：

```text
http://localhost:3000/
```

创建任务：

```bash
npx --yes --package . agent-test run \
  --requirement "访问 https://example.com 并验证 Example Domain 文本可见" \
  --url "https://example.com" \
  --wait
```

## Docker Compose

```bash
docker compose -f infra/docker-compose.yml up --build
```

服务端口：

- Orchestrator: `http://localhost:3000`
- Executor: `http://localhost:3001`
- Postgres/pgvector: `localhost:5432`

## 环境变量

复制 `.env.example` 为 `.env`，按需填写：

- `OPENAI_API_KEY`：可选，不填则使用启发式 Planner/CodeGen。
- `EXECUTOR_BASE_URL`：默认 `http://localhost:3001`。
- `SELF_HEAL_ENABLED`：默认 `true`。
- `FLOW_HEAL_ENABLED`：默认 `true`。

## 当前阶段说明

这版实现已经覆盖了你计划中的基础骨架、主链路、规则级自愈、流程级自愈、学习回写与 API/CLI 接入。  
为保持首版可运行，知识库检索目前采用轻量检索（关键字匹配），pgvector 字段和表结构已预留，可在下一步接入 embedding 检索。

## Runtime Safety Flags

- `IGNORE_HTTPS_ERRORS=true`: allow Playwright browser context to ignore invalid HTTPS certificates.
- `AUTO_DOWNGRADE_HTTPS_ON_CERT_ERROR=true`: auto retry `https://` URLs with `http://` when cert validation fails.
- `LLM_TIMEOUT_MS=45000`: timeout for one LLM request.
- `LLM_RETRY_COUNT=4`: retry count for retryable LLM errors.
- `LLM_MIN_INTERVAL_MS=1200`: minimum interval between LLM requests to reduce rate-limit failures.
