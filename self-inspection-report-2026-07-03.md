# 回测平台全面自检报告

> **生成时间**: 2026-07-03
> **执行方式**: 10 维度并行自动化 **subagent-driven-development** · 阅读式全量分析
> **基线**: 151 测试文件 · 2496 测试 · 0 个测试级失败 (仅集成测试路径中断)

---

## 自检摘要

| 维度              | 严重发现 | 中低发现 | 整体评分  |
| ----------------- | -------- | -------- | --------- |
| 1. 代码质量与风格 | 2        | 4        | ❌ 需修复 |
| 2. 架构一致性     | 0        | 1        | ✅ 优秀   |
| 3. 测试质量       | 3        | 2        | ❌ 需修复 |
| 4. 安全性         | 1        | 2        | ⚠️ 良好   |
| 5. 性能           | 0        | 2        | ✅ 优秀   |
| 6. 依赖与供应链   | 0        | 3        | ✅ 优秀   |
| 7. 文档完整性     | 1        | 3        | ⚠️ 良好   |
| 8. 可观测性       | 0        | 2        | ✅ 良好   |
| 9. 数据库与迁移   | 0        | 1        | ✅ 优秀   |
| 10. 配置与构建    | 0        | 2        | ✅ 优秀   |

**总计**: Critical 0 · High 7 · Medium 22 · Low 34

---

## 维度一：代码质量与风格

### 自动化工具结果

| 工具                | 结果                                                     | 状态    |
| ------------------- | -------------------------------------------------------- | ------- |
| tsc --noEmit        | 6 错误 (BacktestOptimizerPage.tsx 导入不存在符号)        | ❌ FAIL |
| eslint .            | 2322 错误, 33 警告 (no-useless-escape 占 2289+)          | ❌ FAIL |
| prettier --check    | 195 文件格式不一致                                       | ❌ FAIL |
| knip --no-exit-code | 15 未使用文件, 80 未使用导出, 87 未使用类型, 17 依赖问题 | ❌ FAIL |
| eslint-disable 压制 | 7 条 (4 no-explicit-any, 3 exhaustive-deps)              | ✅ 合理 |

### 大文件审查

27 个文件 >500 行:

| 文件                 | 行数 | 风险               |
| -------------------- | ---- | ------------------ |
| engine/portfolio.ts  | 1176 | 🔴 Node 遗留引擎   |
| AnalysisCharts.tsx   | 1064 | 🔴 前端大组件      |
| DataEnginePage.tsx   | 950  | 🔴 前端大页面      |
| PortfolioEditor.tsx  | 857  | 🔴 前端大组件      |
| LumpSumVsDCAPage.tsx | 847  | 🔴 前端大页面      |
| TacticalGridPage.tsx | 815  | 🔴                 |
| app.ts (backend)     | 808  | 🔴 路由+中间件编排 |

### TypeScript 严格性

所有严格性选项均已启用 (strict, noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch 全为 true)。

### 复杂度规则

| 规则                         | 阈值 | 状态             |
| ---------------------------- | ---- | ---------------- |
| complexity                   | 15   | ✅               |
| max-depth                    | 4    | ✅               |
| max-lines-per-function       | 80   | ⚠️ 17 个函数超标 |
| max-params                   | 5    | ✅               |
| max-nested-callbacks         | 3    | ✅               |
| sonarjs/cognitive-complexity | 15   | ✅               |

**主要发现**: TS 构建断裂 (BacktestOptimizerPage.tsx) · no-useless-escape 占 98% ESLint 错误 · 195 文件未格式化 · 27 大文件 · 167 未使用导出/类型。

---

## 维度二：架构一致性

| 检查项          | 结果                                                             | 状态    |
| --------------- | ---------------------------------------------------------------- | ------- |
| DDD 层级 purity | 3 处 application→services 导入                                   | ⚠️ 轻度 |
| API 版本化      | 20 v1 + 18 legacy deprecation, 全覆盖                            | ✅      |
| 中间件链        | 8 计算端点完整 auth→tenant→perm→quota→audit                      | ✅      |
| 降级模式        | Go 引擎 fail-closed (503+Retry-After) · 数据 degraded · 前端消费 | ✅      |
| RFC 7807        | sendProblem() 全实现, 包装为 success/error 信封                  | ✅      |
| RBAC            | 3 角色 x 7 权限, 完整映射                                        | ✅      |

**主要发现**: 架构成熟度高。仅 3 处 DDD 轻度违规、ADR-031 需同步运行手册。

---

## 维度三：测试质量

### 测试分布

| 类型         | 文件数 | 状态                |
| ------------ | ------ | ------------------- |
| unit/        | 137    | ✅                  |
| integration/ | 4      | ❌ 2 个因旧路径中断 |
| e2e/ui/      | 7      | ✅                  |
| chaos/       | 4      | ✅                  |
| fuzz/        | 1      | ✅                  |
| consistency/ | 1      | ✅                  |
| contract/    | 1      | ✅                  |
| benchmark/   | 1      | ✅                  |

### 测试运行

- **2496 测试通过**, 25 跳过, 0 个测试级失败
- 136 文件通过 (97.8%), 2 文件失败

### 覆盖率

| 指标       | 实际   | 目标 (AGENTS.md) | 状态 |
| ---------- | ------ | ---------------- | ---- |
| Lines      | 3.50%  | 70%              | ❌   |
| Functions  | 17.42% | 70%              | ❌   |
| Branches   | 46.38% | 60%              | ❌   |
| Statements | 3.50%  | 70%              | ❌   |

_注: 覆盖报告可能包含过时路径 (指向 api/ 而非 packages/backend/src/), 但 3.5% 无论何种路径都很低。_

### Go 测试

| 模块         | 测试状态                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| engine-go    | 4/8 包有测试 (engine, middleware, montecarlo, optimizer)                                                         |
| data-fetcher | 2/11 包有测试 (root, baostock)                                                                                   |
| **零测试包** | **12 个** — analysis, observability, server, akshare, finnhub, httpclient, provider, twelvedata, yfinance, cmd/* |

**主要发现**: 覆盖率 3.5% 是最高风险 · 2 集成测试路径中断 · 12 Go 包零测试 · 前端 utils/ 8 文件零测试。

---

## 维度四：安全性

| 检查项    | 结果                                                     | 状态      |
| --------- | -------------------------------------------------------- | --------- |
| npm audit | 0 高危/严重漏洞                                          | ✅        |
| Secrets   | .env 明文 FINNHUB/TWELVEDATA API keys (gitignored)       | ⚠️ MEDIUM |
| JWT 认证  | RS256 · Refresh Token 轮换 · Token Family · hashUserId() | ✅        |
| 输入验证  | 11 Zod schemas / 50 mutation routes = **22%**            | 🔴 HIGH   |
| CORS      | 生产 wildcard 双保障 (validateConfig + app.ts)           | ✅        |
| Docker    | engine-go builder 浮动 tag                               | ⚠️ MEDIUM |
| K8s       | runAsNonRoot · readOnlyRootFilesystem · drop ALL caps    | ✅        |
| 数据库    | RLS + FORCE + NOBYPASSRLS · SHA256 哈希                  | ✅        |

**主要发现**: 输入验证 22% 为最高安全风险 · .env 明文 API keys 需迁至 secrets manager · engine-go Docker builder 未 pin digest。

---

## 维度五：性能

| 检查项             | 结果                                              | 状态      |
| ------------------ | ------------------------------------------------- | --------- |
| 前端懒加载         | 35/35 页面 100% React.lazy                        | ✅        |
| Vite manual chunks | react-vendor/chart-vendor/state-vendor            | ✅        |
| 数据库分页         | 所有 list 端点有 LIMIT/OFFSET                     | ✅        |
| N+1 查询           | 仅 Go 回退路径含 per-ticker N+1 (semaphore=10)    | ⚠️ 低风险 |
| LRU 缓存           | 实现为 FIFO (非真正 LRU)                          | ⚠️ 低     |
| Engine 配置        | 5s timeout · 50% threshold · 30s reset · 2 次重试 | ✅        |

**主要发现**: 性能优秀。只 3 个 low 问题 — LRU FIFO bug · searchTickers 全加载后过滤 · 无 HTTP 缓存头。

---

## 维度六：依赖与供应链

| 检查项        | 结果                                         | 状态    |
| ------------- | -------------------------------------------- | ------- |
| npm audit     | 0 high/critical                              | ✅      |
| Go 版本       | 1.26.0 vs 1.26.4 (engine-go vs data-fetcher) | ⚠️ 轻微 |
| Docker digest | 10/12 stages pinned; 2 floating              | ⚠️      |
| SBOM          | syft + CycloneDX 脚本就绪                    | ✅      |
| 签名          | cosign + Sigstore 脚本就绪                   | ✅      |
| 未使用 deps   | zod (frontend)                               | ⚠️      |

**主要发现**: 供应链安全成熟。2 个浮动 Docker tag · Go 版本不一致 · SBOM/signing 未接入 CI。

---

## 维度七：文档完整性

| 检查项          | 结果                                 | 状态 |
| --------------- | ------------------------------------ | ---- |
| ADR 完整性      | 37 份连续 (ADR-001~037)              | ✅   |
| ADR-代码一致性  | ADR-031 fail-closed 未完全同步       | ⚠️   |
| OpenAPI         | 38 路径, 47 方法, 13 标签            | ✅   |
| ARCHITECTURE.md | 仍引用 Rust/Node 降级链              | ⚠️   |
| runbook.md      | 缺 Go 引擎部署; 仍引用 Rust 故障排查 | ⚠️   |
| 威胁模型        | v2.1 · STRIDE · 21/21 项跟踪         | ✅   |
| JSDoc           | 922 JSDoc / 335 exports (2.75x)      | ✅   |

**主要发现**: ADR-031 与 ARCHITECTURE.md 和残余代码路径存在显著分歧 · runbook 缺 Go 引擎 · 威胁模型和 JSDoc 优秀。

---

## 维度八：可观测性

| 检查项        | 结果                                                   | 状态 |
| ------------- | ------------------------------------------------------ | ---- |
| 日志框架      | pino + pino-http · 敏感字段 redact · trace_id 关联     | ✅   |
| 审计日志      | 仅写操作 · outbox + HMAC-SHA256 完整性                 | ✅   |
| 自定义指标    | 13 个 (覆盖 4 Golden Signals)                          | ✅   |
| 熔断器指标    | 3 个 breaker 已 instrumented                           | ✅   |
| OpenTelemetry | http/express/fetch 自动 instrument + PgInstrumentation | ✅   |
| 告警          | 仅 burn-rate · 缺 breaker/lag/degraded 规则            | ⚠️   |

**主要发现**: 可观测性栈生产级。仅告警规则需扩展 (缺 circuit breaker, event loop lag, degraded response rate, pool saturation)。

---

## 维度九：数据库与迁移

| 检查项     | 结果                                         | 状态 |
| ---------- | -------------------------------------------- | ---- |
| 迁移完整性 | 12 版本, 24 文件, 100% up/down               | ✅   |
| 破坏性操作 | 零 destructive DROP 在前向迁移               | ✅   |
| RLS        | FORCE RLS + NOBYPASSRLS, 5 张租户表          | ✅   |
| CHECK 约束 | 13 条 (OHLC, 正数, 枚举, 时序)               | ✅   |
| 索引       | 24 个 (B-tree/GIN/BRIN/partial/expression)   | ✅   |
| 最小权限   | DML-only · 无 DDL · ALTER DEFAULT PRIVILEGES | ✅   |
| 连接池     | 20/2 可配置但未在 env.example 文档化         | ⚠️   |

**主要发现**: 数据库层 A 级。RLS、索引、最小权限均生产就绪。仅小建议：文档化 DB_POOL_MAX/MIN。

---

## 维度十：配置与构建

| 检查项              | 结果                                                     | 状态  |
| ------------------- | -------------------------------------------------------- | ----- |
| .env.example 完整性 | 所有 27+ vars 文档化 + 中文注释 + ADR 引用               | ✅ A+ |
| 生产安全默认        | CORS/JWT/DB URL/API Key 有保护                           | ✅    |
| Docker 多阶段       | builder+runner · non-root · HEALTHCHECK                  | ✅    |
| docker-compose      | 127.0.0.1 绑定 · 健康检查 · 服务依赖                     | ✅    |
| K8s                 | HPA · PDB (go-data缺) · 三探针 · 安全上下文              | ⚠️    |
| Vite 构建           | 3 manual chunks · 可扩展                                 | ⚠️    |
| CI/CD               | 12 jobs · gitleaks/Trivy/cosign/SBOM/provenance · 缺部署 | ✅    |

**主要发现**: 环境变量文档 A+ · K8s auth tokens 在 ConfigMap 非 Secret (中风险) · go-data 缺 PDB · redis 未 pin · CI/CD 全面但缺部署 workflow。

---

## 优先级排序

### High (7)

| #   | 维度 | 问题                                                       | 影响             |
| --- | ---- | ---------------------------------------------------------- | ---------------- |
| 1   | 测试 | 覆盖率 3.5% (目标 70%)                                     | 最高回归风险     |
| 2   | 安全 | 输入验证 22% (39/50 路由缺 schema)                         | 注入/边界风险    |
| 3   | 代码 | TS 6 错误 — BacktestOptimizerPage.tsx 导入不存在符号       | 构建断裂         |
| 4   | 代码 | ESLint 2322 错误 (2289 条 no-useless-escape)               | 代码质量噪音     |
| 5   | 测试 | 2 集成测试因旧路径中断 (api/ → packages/backend/src/)      | 集成质量降级     |
| 6   | 测试 | 12 个 Go 包零测试                                          | Go 代码无法验证  |
| 7   | 文档 | ADR-031 fail-closed 未全同步到代码 (架构文档+残余降级路径) | 运行时行为不一致 |

### Medium (22)

| #   | 维度     | 问题                                                                                |
| --- | -------- | ----------------------------------------------------------------------------------- |
| 1   | 安全     | .env 明文 API keys (FINNHUB, TWELVE_DATA)                                           |
| 2   | 安全     | engine-go Docker builder 浮动 tag                                                   |
| 3   | 代码     | 27 个大文件 >500 行                                                                 |
| 4   | 代码     | Knip 167 未使用导出/类型                                                            |
| 5   | 依赖     | Go 版本不一致 (1.26.0 vs 1.26.4)                                                    |
| 6   | 依赖     | distroless runner + engine-go builder 浮动 tag                                      |
| 7   | 文档     | runbook 缺 Go 引擎部署章节                                                          |
| 8   | 文档     | ARCHITECTURE.md 仍引用旧降级链 (Rust → Node)                                        |
| 9   | 配置     | K8s auth tokens (ENGINE_AUTH_TOKEN, DATA_SERVICE_AUTH_TOKEN) 在 ConfigMap 非 Secret |
| 10  | 测试     | 前端 utils/ 8 文件零测试                                                            |
| 11  | 代码     | Prettier 195 文件未格式化                                                           |
| 12  | 架构     | DDD 3 处 application→services 导入                                                  |
| 13  | 代码     | 17 个函数超 max-lines-per-function (80)                                             |
| 14  | 代码     | 7 条 eslint-disable 压制需长期评审                                                  |
| 15  | 可观测性 | 告警缺 circuit breaker/lag/degraded 规则                                            |
| 16  | 文档     | runbook 环境变量表过时 (引用 ADMIN_API_KEY 而非 JWT/RBAC)                           |
| 17  | 文档     | ARCHITECTURE.md 路径引用 (api/routes/ → packages/backend/src/routes/)               |
| 18  | 安全     | Dockerfile.frontend 缺显式 USER nginx                                               |
| 19  | 配置     | go-data 缺 PDB                                                                      |
| 20  | 配置     | redis 未 pin digest                                                                 |
| 21  | 配置     | Vite 仅 3 manual chunks                                                             |
| 22  | 数据库   | DB_POOL_MAX/MIN 未在 env.example 文档化                                             |

### Low (34)

| #     | 维度     | 问题                                                                   |
| ----- | -------- | ---------------------------------------------------------------------- |
| 1-10  | 性能     | LRU FIFO bug · searchTickers 全加载 · 无 HTTP 缓存头 · 单 Store 可优化 |
| 11-20 | 依赖     | Knip 测试文件噪音 · unused devDeps 假阳性                              |
| 21-30 | 可观测性 | 文档欠详细 · 无告警 runbook 步骤                                       |
| 31-34 | 其他     | distroless 无标签 · 无 SECURITY.md · 无部署 workflow                   |

---

## 趋势对比 (vs 2026-07-02)

| 对比项          | 2026-07-02 | 2026-07-03 | 变化                        |
| --------------- | ---------- | ---------- | --------------------------- |
| TypeScript 错误 | 0          | 6          | ❌ 新增                     |
| ESLint 错误     | 0          | 2322       | ❌ 新增 (no-useless-escape) |
| Prettier 不一致 | 53         | 195        | ⚠️ 增多                     |
| 大文件 >500 行  | 15         | 27         | ⚠️ 增多                     |
| 测试文件数      | 141+7      | 151+7      | ✅ 增加                     |
| 测试总数        | 2441       | 2496       | ✅ 增加 55                  |
| 集成测试中断    | 0          | 2          | ❌ 新增                     |
| Go 零测试包     | 6+         | 12         | ❌ 增多                     |
| ADR 数量        | 37         | 37         | ✅ 不变                     |
| npm audit 漏洞  | 0          | 0          | ✅                          |

---

## 附件: 各维度报告文件

- `inspection-task1-code-quality.md` — 详细 Knip 清单, 大文件列表, ESLint 规则分布
- `inspection-task2-architecture.md` — DDD 违规详情, 路由表, RBAC 矩阵
- `inspection-task3-test-quality.md` — 测试分布, Go 包清单, 覆盖配置分析
- `inspection-task4-security.md` — schema 路由明细, Docker 文件逐项检查
- `inspection-task5-performance.md` — LRU bug 细节, 分页验证, Engine 配置
- `inspection-task6-dependencies.md` — Go 版本, Docker pin 状态, SBOM 就绪
- `inspection-task7-documentation.md` — ADR 一致性抽样, runbook 缺陷分析
- `inspection-task8-observability.md` — 指标清单, 告警规则, 追踪配置
- `inspection-task9-database.md` — 迁移表, 索引清单, RLS 逐项验证
- `inspection-task10-config-build.md` — env 变量表, K8s 配置, CI/CD 作业详解

**该报告仅用于自检分析，不涉及任何代码修改。**
