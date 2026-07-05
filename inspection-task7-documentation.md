# 文档完整性检查报告 (Task 7)

**检查日期**: 2026-07-03  
**检查范围**: docs/ 目录 + 代码一致性抽样

---

## 1. ADR 清单与编号连续性

| 指标       | 结果                                                    |
| ---------- | ------------------------------------------------------- |
| ADR 总数   | **37**（ADR-001 ~ ADR-037）                             |
| 编号连续性 | ✅ **连续**，无缺失编号                                 |
| 命名规范   | ✅ 统一格式 `ADR-NNN-中文标题.md`，中文描述+英文关键词  |
| 文件完整性 | ✅ 每份 ADR 均含 Context / Decision / Consequences 结构 |

---

## 2. ADR-代码一致性抽样

### ADR-004 (Express 框架选型) — ✅ 一致

- `app.ts:5` `import express from 'express'`
- `app.ts:52` `const app: express.Application = express()`
- 路由、中间件、错误处理均使用 Express 模式

### ADR-017 (JWT + RBAC 认证授权) — ✅ 一致

- RS256 非对称签名算法实现（`jwtSigner.ts`，`jwtVerifier.ts`）
- 3 角色 × 7 权限的 RBAC（`rbac.ts`）
- 生产环境默认 RS256，开发环境默认为 HS256（`config/index.ts:201-205`）
- 密钥轮换支持、`timingSafeEqual` 常量时间比较

### ADR-031 (单 Go 引擎 + Fail-Closed) — ⚠️ 部分不一致

- **一致的部分**：
  - `backtest-service.ts:49` JSDoc 声明当 Go/Rust 均不可用时抛出 `EngineUnavailableError`
  - `engineClient.ts:244` 声明"不再静默降级到 Node/Rust"
- **不一致的部分**：
  - `docs/ARCHITECTURE.md:24-25, 41-43, 56-58` 仍显示 Rust → Node 完整降级链（Go → Rust → Node）
  - `engine/portfolio.ts:852` 仍保留 `runPortfolioBacktest` Node 备用引擎
  - `engineClient.ts:162` 仍定义 `degradedMessage` 字段用于 Node 降级
  - `config/index.ts:369-378` 仍保留 Node 降级告警文案
  - `metrics.ts:180,288` 仍记录 `fallbackToNodeTotal` 降级计数
  - `dataRoutes.ts:79,86,89` 仍包含"降级到Node.js"逻辑
  - **结论**: 代码中既存在 fail-closed 路径也存在静默降级路径，迁移不彻底，存在运行时行为不一致风险

### ADR-032 (多租户 RLS 隔离) — ✅ 一致

- `migrations/009_tenancy.sql` 实现 RLS 策略（行级安全）
- `db/index.ts:185-189` `withTenant()` 事务级租户上下文注入
- `middleware/tenantContext.ts` 租户解析中间件
- 租户数据表（portfolios/saved_configs/backtest_runs）启用 + FORCE RLS
- 身份/控制平面表不启用 RLS（设计合理）
- 市场数据表不加 tenant_id、不启用 RLS（全局共享）

---

## 3. OpenAPI 规范

| 指标            | 结果                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 文件大小        | 3365 行                                                                                                                                   |
| 定义的 API 路径 | **38** 条                                                                                                                                 |
| HTTP 方法条目   | **47**（post/get/put/delete/patch）                                                                                                       |
| 定义的服务标签  | 13 个（backtest, data, data-manage, admin, health, tactical, tactical-grid, pca, signal, letf, goal-optimizer, backtest-optimizer, auth） |
| 认证方案        | ✅ JWT Bearer + x-api-key 双模式                                                                                                          |
| 速率限制        | ✅ 文档化（普通 100/15min，计算 10/min）                                                                                                  |
| 响应格式        | ✅ 统一 `{ success, data?, error? }`                                                                                                      |

**实际注册的路由挂载点**（`app.ts:596-721`）：
18 个挂载点：`/api/data`, `/api/data/manage`, `/api/backtest`, `/api/backtest-optimizer`, `/api/tactical`, `/api/pca`, `/api/signal`, `/api/letf`, `/api/tactical-grid`, `/api/goal-optimizer`, `/api/admin`, `/api/auth`, `/api/keys`, `/api/portfolios`, `/api/configs`, `/api/runs`, `/api/orgs`, `/api/billing`

**OpenAPI 覆盖评估**: 基础覆盖完整，但子路径细节（如每个路由下的具体端点）需抽样验证是否存在遗漏。

---

## 4. 架构文档 (ARCHITECTURE.md)

| 指标         | 结果                                |
| ------------ | ----------------------------------- |
| 总行数       | 379                                 |
| 服务拓扑图   | ✅ Mermaid 流程图                   |
| 降级链详解   | ✅ 3 层降级（Go → Rust → Node）     |
| 数据流描述   | ✅ 含 API → 服务 → 存储的完整数据流 |
| 设计决策引用 | ✅ 引用 ADR-016、ADR-032 等         |

**问题**:

- ⚠️ 仍展示 Rust 和 Node 引擎降级链，与 ADR-031 fail-closed 决策冲突
- ⚠️ 第 60 行引用 `api/routes/backtestRoutes.ts` 路径不存在（应为 `packages/backend/src/routes/`）

---

## 5. 运维手册 (runbook.md)

| 指标            | 结果                                    |
| --------------- | --------------------------------------- |
| 总行数          | 524                                     |
| 最后更新        | 2026-06-25                              |
| 服务架构概览    | ✅ ASCII 拓扑图 + 端口/启动/健康检查表  |
| 启动/停止       | ✅ 开发环境 + 生产环境                  |
| 健康检查        | ✅ 端点 + curl 命令                     |
| 关键指标        | ✅ 4 项指标 + 告警阈值                  |
| 故障场景        | ✅ 7 个场景（引擎/数据/前端/PG/缓存等） |
| 部署指南        | ✅ 手动部署 + Docker（标注未验证）      |
| 回滚流程        | ✅ 3 种场景（代码/引擎/数据）           |
| 环境变量        | ✅ 完整参考表                           |
| 测试命令速查    | ✅                                      |
| Escalation 路径 | ✅ 3 层（L1-L3），含响应时间            |
| SLA/SLO 定义    | ✅ 可用性 99.5%、P95 < 2s、错误率 < 1%  |
| 事故分级        | ✅ SEV0-SEV3                            |
| Burn Rate Alert | ✅ 快速燃烧 + 慢速燃烧步骤              |
| Postmortem 模板 | ✅ 标准模板                             |

**问题**:

- ⚠️ 部署步骤仅包含 Rust 引擎和 Go 数据服务，**缺少 Go 引擎 (engine-go) 的部署**
- ⚠️ 7 个故障场景均围绕 Rust 引擎故障排查，未覆盖 Go 引擎故障场景
- ⚠️ 构建/测试命令未包含 Go 引擎测试（`go test ./...` in engine-go/）
- ⚠️ 环境变量表仍引用旧 `ADMIN_API_KEY`，未反映 JWT/RBAC 认证模式

---

## 6. 威胁模型 (threat-model.md)

| 指标         | 结果                                                    |
| ------------ | ------------------------------------------------------- |
| 版本         | v2.1                                                    |
| 日期         | 2026-06-24                                              |
| 方法论       | STRIDE (Microsoft)                                      |
| 总行数       | 184                                                     |
| 信任边界     | 7 个（TB-1 ~ TB-7）                                     |
| 威胁项       | 21 个（S-1~~5, T-1~~4, R-1~~3, I-1~~5, D-1~~5, E-1~~6） |
| 所有威胁状态 | ✅ 全部跟踪（已缓解/部分/可接受）                       |
| 安全评分     | ✅ 7 维度星级评分                                       |
| 变更摘要     | ✅ v1.1 → v2.0 → v2.1 完整追溯                          |

**问题**: 无重大遗漏。T-4 (mTLS) 为唯一未完全解决项，状态标注清晰。

---

## 7. JSDoc 覆盖率

| 指标                                                        | 结果    |
| ----------------------------------------------------------- | ------- |
| 导出语句总数 (`export function/const/class/interface/type`) | **335** |
| JSDoc 注释总数 (`/**`)                                      | **922** |
| 平均 JSDoc 每导出                                           | ~2.75   |

**评估**: JSDoc 覆盖率良好。922 个 `/**` 注释覆盖 335 个导出语句，多数导出函数/接口均有文档。符合 AGENTS.md 对导出的函数接口需要 JSDoc 的要求。

---

## 8. 总体评估

| 维度           | 评分      | 说明                                    |
| -------------- | --------- | --------------------------------------- |
| ADR 完整性     | ✅ 优秀   | 37 份连续编号，覆盖全面                 |
| ADR-代码一致性 | ⚠️ 需修复 | ADR-031 与代码/架构文档存在显著分歧     |
| OpenAPI 覆盖   | ✅ 良好   | 38 路径 47 方法，标签完整               |
| 架构文档       | ⚠️ 需更新 | 拓扑图与 ADR-031 冲突，路径引用错误     |
| 运维手册       | ⚠️ 需补充 | 缺少 Go 引擎部署/故障排查，环境变量过时 |
| 威胁模型       | ✅ 优秀   | 版本最新，跟踪完整                      |
| JSDoc 覆盖率   | ✅ 良好   | 2.75 JSDoc/导出                         |

### 优先修复项

1. **高**: ADR-031 的 fail-closed 决策需同步到 ARCHITECTURE.md（降级链）和 engineClient.ts（清理残余降级路径）
2. **高**: runbook.md 需增加 Go 引擎 (engine-go) 的部署、启动、故障排查章节
3. **中**: runbook.md 环境变量表更新为 JWT/RBAC 模式
4. **中**: ARCHITECTURE.md 路径引用修正
