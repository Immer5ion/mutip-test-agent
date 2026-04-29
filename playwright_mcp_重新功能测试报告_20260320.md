# Playwright MCP 重新功能测试报告（更新 Skill）

## 1. 范围与假设

| 项目 | 内容 |
| --- | --- |
| 测试目标 | 通过更新后的 `playwright-mcp-web-exploration-test-design` skill，重新执行系统功能探索与高覆盖回归 |
| 目标系统 | Dify 控制台（私有部署） |
| 测试环境 | `https://10.110.112.31/` |
| 测试账号 | `（已脱敏）` |
| 执行日期 | 2026-03-20（Asia/Shanghai） |
| 执行方式 | Playwright MCP（`/mcp/execute`）探索 + 批量回归 + 失败项补测 |
| 设备范围 | Desktop `1366x768`，Mobile `390x844` |
| 本次范围 | 登录/会话、Studio、应用详情（编排/API/日志标注/监测）、Explore、Knowledge、Tools、Plugins、Account、导航连续性、移动端可用性 |
| 非本次范围 | 真实发布、生产破坏性写操作、真实密码修改成功链路、真实插件安装落地 |

## 2. 全程执行记录

| 阶段 | Run ID | 时间（UTC） | 结果 |
| --- | --- | --- | --- |
| 探索 | `retest-exp-20260320132836` | 2026-03-20T05:28:36.995Z ~ 2026-03-20T05:29:04.265Z | 通过 |
| 主回归 | `retest-full-20260320134217` | 2026-03-20T05:42:17.603Z ~ 2026-03-20T05:46:30.672Z | 首轮 35 通过 / 12 失败 |
| 补测 | `retest-fix-20260320134810` | 2026-03-20T05:48:10.489Z ~ 2026-03-20T05:48:54.799Z | 12/12 通过 |

说明：主回归失败项均为脚本定位冲突（弹窗遮挡、定位器超时）导致，补测后全部转绿。

## 3. 系统映射

| 页面 | 功能域 | 关键动作 | 结果 |
| --- | --- | --- | --- |
| `/signin` | 认证 | 账号密码登录 | 通过 |
| `/apps` | Studio 应用管理 | 搜索、筛选、创建入口、进入应用 | 通过 |
| `/app/{id}/workflow` | 应用编排 | 编排页加载、关键控件可见 | 通过 |
| `/app/{id}/develop` | API 接入 | API 文档与密钥区可见 | 通过 |
| `/app/{id}/logs` | 日志 | 日志页可访问 | 通过 |
| `/app/{id}/annotations` | 标注 | 新增标注、必填校验 | 通过 |
| `/app/{id}/overview` | 监测 | 时间范围切换（7天->今天） | 通过 |
| `/explore/apps` | 模板探索 | 分类筛选、搜索空态 | 通过 |
| `/datasets` | 知识库列表 | 搜索与空态 | 通过 |
| `/datasets/create` | 创建知识库 | 无文件时 Next 禁用 | 通过 |
| `/datasets/connect` | 外部知识库连接 | Connect 禁用、参数边界校验 | 通过 |
| `/tools` | 工具中心 | Custom/Workflow/MCP 切换、搜索 | 通过 |
| `/plugins` | 插件中心 | 安装来源菜单、搜索空态 | 通过 |
| `/plugins?category=discover` | 插件市场 | 市场页入口可见 | 通过 |
| `/account` | 账户设置 | 用户名空值、密码不一致校验 | 通过 |

## 4. 覆盖与结果

### 4.1 用例统计

- 唯一用例数：47
- 首轮：35 通过，12 失败
- 补测：12 通过，0 失败
- 最终：47 通过，0 失败

### 4.2 优先级统计

- P0：20/20 通过
- P1：24/24 通过
- P2：3/3 通过

### 4.3 覆盖度评估

| 评估项 | 目标门槛 | 实际值 | 结论 |
| --- | --- | --- | --- |
| 关键模块覆盖率 | >= 90% | 11/11 = 100% | 达标 |
| P0 覆盖率 | = 100% | 20/20 = 100% | 达标 |
| 分支覆盖率（Happy+异常+状态） | >= 80% | 约 85.7% | 达标 |
| 边界值覆盖率 | >= 85% | 5/5 = 100%（本次识别边界项） | 达标 |
| 负向覆盖率 | >= 35% | 18/47 = 38.3% | 达标 |
| 跨端覆盖 | 桌面+移动 | 已覆盖 | 达标 |
| 权限/会话覆盖 | 至少 1 条 | 已覆盖（401 场景） | 达标 |

最终结论：本次通过 Playwright MCP 执行的重新测试已达到高覆盖目标，测试达标。

## 5. 边界与负向覆盖清单

### 5.1 边界值

- TC-009：创建应用名称为空，Create 禁用
- TC-010：创建应用名称填充后，Create 可用
- TC-021：监测时间范围 `Last 7 Days -> Today`
- TC-029：TopK 边界 `min=1,max=10`
- TC-030：Score 边界 `min=0,max=1,step=0.01`

### 5.2 负向/异常

- TC-005、TC-007、TC-009、TC-010、TC-015
- TC-018、TC-019、TC-024、TC-026、TC-027、TC-028
- TC-029、TC-030、TC-033、TC-036、TC-039、TC-041、TC-042

## 6. 风险与待确认

| 类型 | 描述 | 影响 | 建议 |
| --- | --- | --- | --- |
| 风险 | 未执行真实写入型操作（创建成功、发布、真实密码变更） | 中 | 在隔离环境补充可回滚写操作回归集 |
| 风险 | 插件安装仅验证入口，未执行真实安装-卸载闭环 | 中 | 增补插件安装落地专项回归 |
| 待确认 | TC-015 未复现 localhost API base URL，疑似已修复 | 低 | 与后端配置变更记录交叉确认 |

## 7. 全量证据与可追溯文件

- 探索结果：`D:/fakepath/mutip-test-agent/temp/retest-20260320/01-exploration-result.json`
- 主回归结果：`D:/fakepath/mutip-test-agent/temp/retest-20260320/02-full-regression-result.json`
- 补测结果：`D:/fakepath/mutip-test-agent/temp/retest-20260320/03-targeted-regression-result.json`
- 合并台账（47 条明细）：`D:/fakepath/mutip-test-agent/temp/retest-20260320/04-combined-results.json`
- 探索 Trace：`D:/fakepath/mutip-test-agent/apps/executor/apps/executor/artifacts/retest-exp-20260320132836/0/trace.zip`
- 主回归 Trace：`D:/fakepath/mutip-test-agent/apps/executor/apps/executor/artifacts/retest-full-20260320134217/0/trace.zip`
- 补测 Trace：`D:/fakepath/mutip-test-agent/apps/executor/apps/executor/artifacts/retest-fix-20260320134810/0/trace.zip`
