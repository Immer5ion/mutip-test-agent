---
name: playwright-mcp-web-exploration-test-design
description: Explore web systems with Playwright MCP and produce functional test design artifacts. Use when tasks involve unknown web applications, feature discovery, flow and state mapping, risk-based scenario design, regression planning, or converting exploratory findings into structured test cases. Prefer Chinese output by default unless the user explicitly asks for another language.
---

# Playwright MCP 网页探索与功能测试设计

## 概述

使用 Playwright MCP 对 Web 系统进行结构化探索，梳理功能能力、关键状态流转，并产出可执行的功能测试设计结果。
默认使用中文输出；仅在用户明确要求时切换为英文或双语。

## 工作流

### 1. 明确目标与边界

- 明确探索目标：功能盘点、变更影响评估、回归范围收敛或上线前风险识别。
- 明确约束条件：环境 URL、鉴权方式、测试账号、浏览器/设备范围、时区/语言和时间预算。
- 在上下文缺失时，先声明假设，再继续执行。

### 2. 建立探索基线

- 从落地页开始，识别全局导航、核心模块、角色入口。
- 建立系统映射：`页面 -> 功能 -> 关键动作 -> 预期结果`。
- 记录可复用且稳定的定位锚点（role/name/test-id/text）。

### 3. 深入探索功能流

- 先走主路径（happy path）建立正确行为基准。
- 扩展分支与异常：非法输入、边界值、空状态、权限拒绝、超时、重试、重复提交。
- 追踪状态阶段：动作前、处理中、成功、部分失败、回滚。
- UI 证据不足时，结合网络请求与响应确认规则。

### 4. 转换为测试模型

- 按能力域和风险聚类。
- 从以下维度拆解场景：
  - 用户角色
  - 业务前置条件
  - 输入类型
  - 外部依赖
  - 客户端上下文（浏览器/分辨率/语言/时区）
- 按业务影响与发生概率标注 `P0`、`P1`、`P2`。

### 5. 产出测试设计结果

- 输出应包含且可追溯：
  - 覆盖矩阵
  - 优先级场景清单
  - 用例草案（前置、步骤、预期、清理）
  - 回归建议（冒烟/完整）
- 使用 `references/test-design-template.md` 中的中文模板。

### 6. 交付前质量门禁

- 每个关键功能至少覆盖 1 条正向 + 1 条反向场景。
- 每个异步或状态型流程都要有可验证 oracle（判定标准）。
- 明确列出假设、阻塞项、不可测范围。

## Playwright MCP 执行规范

- 优先确定性操作：
  - 页面可交互锚点稳定后再执行动作。
  - 避免脆弱定位；优先语义稳定定位方式。
  - 关键结果尽量双重验证：UI 信号 + 状态/网络信号。
- 探索记录应实时沉淀，避免最后凭记忆回填。
- 遇到验证码、第三方依赖不可控、鉴权受限等阻塞，停止猜测并记录精确阻塞步骤。

## Playwright MCP 动作模式

- 每个功能建议按以下循环执行：
  - `browser_navigate` 进入目标页面。
  - `browser_snapshot` 读取结构与可交互目标。
  - `browser_click` / `browser_fill_form` 执行动作。
  - `browser_wait_for` 同步等待可见文本或状态变化。
  - `browser_network_requests` 在需要时校验接口侧结果。
- 每条分支都记录证据：进入状态、执行动作、预期结果、实际结果。

## 输出语言与格式

- 默认中文输出，除非用户明确要求其他语言。
- 术语策略：
  - 首次出现可使用“中文术语（English）”格式。
  - 后续优先中文，必要时保留关键英文关键词（如 API、token、timeout）。
- 输出顺序固定：
1. 范围与假设
2. 系统映射
3. 覆盖矩阵
4. 优先级场景
5. 用例草案
6. 风险、阻塞与待确认项

## 参考资料加载指南

- 需要逐页探索检查项时读取 `references/exploration-checklist.md`。
- 需要产出测试设计交付件时读取 `references/test-design-template.md`。
