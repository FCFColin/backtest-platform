# 宏观架构体检计划 — Macro Architecture Review Plan

> **生成时间**: 2026-07-06
> **范围**: 技术栈合理性 · 模块化程度 · 耦合度与依赖合规 · 数据流完整性 · 演进性 · 技术债全景 · 部署运维成熟度
> **基线**: 已有 10 维度自检报告（inspection-task1~10）+ 42 条 ADR + `self-inspection-report*.md`
> **产出**: 7 份调研切片 + 1 份综合摘要，全部以 report 形式

---

## 调研方法（各切片统一）

每个切片按以下模板执行：

```
1. 关键问题列表（3-5 个决策性问题）
2. 证据收集：已有资料（ADR/自检报告/提交记录）+ 需要补充的扫描
3. 分析：每个问题的判断 + 根因
4. 结论：keep / change / retire / investigate further
```

---

## 切片 01：技术栈合理性

| #   | 关键问题                                                                                      | 已有线索                                                                                 | 调研方法                                                                 |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Q1  | Go 引擎 + Node 规范引擎双轨制是否合理？Node 规范引擎何时可退役？                              | ADR-008/031; portfolio.ts 1176→379 但仍存留; `packages/backend/src/engine/` 有 16 个模块 | 统计 Node 规范引擎调用次数 & 场景，评估移除影响面                        |
| Q2  | Zod v4 迁移完成度？哪些路由仍然裸露？                                                         | 已有自检: 50 路由仅 11 个有 zod schema（22%）                                            | `grep -r "z\.object\|zod" packages/backend/src/routes/` 统计覆盖率       |
| Q3  | React 18 → 19 的升级窗口和阻断项？                                                            | `package.json` 锁定 `react@^18`                                                          | 检查 react 19 兼容性 + 关键依赖（zustand/recharts/react-router）是否就绪 |
| Q4  | pnpm workspace 相对 npm 的实际收益评估？                                                      | 迁移 commit `3ed3c25`（07-03）                                                           | 比较 pnpm-lock 体积、install 耗时、disk usage vs 旧 npm 基线（如有）     |
| Q5  | PostgreSQL + Redis 在当前体量（单机/小团队）下是否过重？备选（SQLite + 内存缓存）的评估需求？ | ADR-007/018; ADR-006 备选 SQLite 但已推翻                                                | 评估当前数据量级+连接数 vs 维护成本，明确过重临界点                      |

---

## 切片 02：模块化程度

| #   | 关键问题                                                                                      | 已有线索                                                     | 调研方法                                                              |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Q1  | 3 个包的边界划分是否合理？shared 有无变成 dumping ground？                                    | pnpm 拆分刚刚完成（`3ed3c25`）; `shared/types/` 有 12 个接口 | `dependency-cruiser` 绘制包间依赖图；检查 shared 中是否混入非类型代码 |
| Q2  | 前端 24 页面按 backtest/analysis/account 子目录聚合是否正交？                                 | 近期待拆分已基本完成                                         | 检查每个子目录的 aggregate root 是否清晰；页面间有无互相 import       |
| Q3  | 后端 20 个路由组职责有无重叠？                                                                | 已注册 20 组 v1 路由                                         | 对比 routes/ 下每个文件负责的 path prefix，检查职责边界               |
| Q4  | DDD 分层 3 处应用层违规是例外还是系统性退化信号？                                             | 已有自检: 3 处 LOW 违规（outboxWriter + dataService 导入）   | 检查 application/ 下全部 8 个文件的 import，看是否有更多隐式违规      |
| Q5  | Go 引擎包划分是否覆盖所有职责？analysis/observability/server 零测试是分工不清还是只是缺测试？ | engine-go 8 个包，4 个有测试，4 个零测试                     | 审查零测试包的职责 + 代码行数，判断是否应拆分或合并                   |

---

## 切片 03：耦合度与依赖合规

| #   | 关键问题                                                               | 已有线索                                                | 调研方法                                                   |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Q1  | 后端依赖方向是否正确？(domain → application → infrastructure → routes) | domain 层已确认纯净（已有自检）; application 3 处逆依赖 | `dependency-cruiser` 全量规则 + lint 结果                  |
| Q2  | 有无循环依赖？                                                         | `.dependency-cruiser.config.mjs` 存在但未知执行结果     | 运行 `npx depcruise packages/backend/src/` 并解析报告      |
| Q3  | pnpm workspace 跨包引用是否都走 `workspace:*` protocol？               | `package.json` 中 `@backtest/*` 依赖                    | `grep` packages/*/package.json 确认                        |
| Q4  | Go engine ↔ Node API 的 HTTP 接口契约有无正式定义？                    | `docs/openapi.yaml` 存在                                | 检查 openapi.yaml 是否覆盖 engine 端点；如有 gap，列出缺失 |
| Q5  | 前端组件树有无跨层依赖（page → service 而非 page → store → service）？ | 无已有数据                                              | `grep` pages/ 中直接 import `services/` 或 `api/` 的模式   |

---

## 切片 04：数据流完整性

| #   | 关键问题                                                                                        | 已有线索                                 | 调研方法                                                                 |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Q1  | 关键路径（回测/MC/优化）前端状态变更链路：UI event → store → API → store → re-render 是否完整？ | ARCHITECTURE.md 3.1                      | 选取回测路径，逐行追踪 frontend store → backend route → service → engine |
| Q2  | 错误传播：Go 503 → Node API → 前端展示有无被吞掉的情况？                                        | ADR-031 fail-closed; DegradedBanner 存在 | 注入模拟错误，验证 ErrorBoundary / toast / degraded 三层的覆盖           |
| Q3  | `degraded: true` 标记在后端所有降级场景中都正确设置了？                                         | ADR-031 + ARCHITECTURE.md 2.1/2.2        | `grep` 后端代码中所有 catch 块，检查 degraded 标记设置率                 |
| Q4  | Outbox 模式：事件 → 持久化 → 发布，有无丢失或重复风险？                                         | ADR-014/024; HMAC-SHA256 + 幂等消费      | 审查 outboxPublisher.ts 的 ack/nack 逻辑 + at-least-once 保证            |
| Q5  | 跨服务类型转换有无信息丢失？(Decimal/Date/NaN 等)                                               | 无已有数据                               | 审查 engineClient.ts、dataService.ts 的 JSON 序列化/反序列化边界         |

---

## 切片 05：演进性

| #   | 关键问题                                          | 已有线索                          | 调研方法                                                          |
| --- | ------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Q1  | 新增一个策略类型需改几个文件？能否 <5 个？        | routes/ → service/ → engine/ 链路 | 以"新增网格回测"为用例，模拟需要 touch 的文件清单                 |
| Q2  | 替换/新增数据源的影响面？                         | data-fetcher 有 6 个 provider     | 评估 provider interface 抽象程度；新增 provider 所需文件数        |
| Q3  | 当前短连接架构支撑实时回测/WebSocket 推送到成本？ | Express + 短连接                  | 评估 SSE/WebSocket 改造成本 vs 收益；检查已有 ws 依赖（如有）     |
| Q4  | 多租户 RLS 模型扩展成本？新增租户类型需要改什么？ | ADR-032; 5 张表 FORCE RLS         | 审查 RLS policy 定义 + migration 历史                             |
| Q5  | 前端独立部署程度：与后端 API 的解耦边界？         | monorepo 同仓库                   | 检查 Vite proxy 配置、API base URL 是否可配置、有无硬编码后端路径 |

---

## 切片 06：技术债全景（汇总层）

| #   | 关键问题                                                                     | 已有线索                                      | 调研方法                                                            |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| Q1  | 已有 P0-P1 债的消化路径：覆盖率 3.5%、ESLint 2322、TS 构建断裂、集成测试损坏 | 两份自检报告                                  | 为每个债估算修复工作量 + 优先级                                     |
| Q2  | 27 个大文件的拆分剩余工作量？                                                | 近期提交大幅减少大文件数                      | 重新运行 `find ... -type f -name '*.ts' -exec wc -l` 统计当前大文件 |
| Q3  | 3.5% → 70% 覆盖率的可行路径？                                                | vitest configs; test/ 目录 137 个单元文件     | 按包/按层估算测试缺口，给出阶段性目标（35% → 50% → 70%）            |
| Q4  | 陈旧文档同步的优先级和时序？                                                 | AGENTS.md / ARCHITECTURE.md / runbook.md 三份 | 评估每份文档的 outdated 程度 + 修复所需工时                         |
| Q5  | 明文密钥和 K8s ConfigMap 安全债治理方案？                                    | `.env` API key / K8s ConfigMap 明文 token     | 评估迁移到 Secret / 密钥管理服务的成本                              |

---

## 切片 07：部署运维成熟度

| #   | 关键问题                                          | 已有线索                             | 调研方法                                                         |
| --- | ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Q1  | CI/CD 完整性：目前只有 CI + release 检测，无 CD？ | `.github/workflows/`                 | 审查 workflow 文件，确认 deploy 步骤缺失                         |
| Q2  | K8s vs Docker Compose 配置漂移？                  | k8s/ 有 18 个清单                    | `diff` 关键配置（环境变量、资源限制、健康检查）在两者间的一致性  |
| Q3  | 可观测性告警覆盖关键 SLO？                        | 13 个自定义指标; 告警规则不完整      | 对照 ARCHITECTURE.md + ADR-015, 列出缺失告警                     |
| Q4  | 灾备策略完整性？                                  | PG 备份 / Redis 持久化 / 引擎多实例  | 检查 docker-compose 和 k8s 中的备份策略                          |
| Q5  | Docker 镜像安全基线？                             | ADR-030 (distroless)、ADR-022 (SBOM) | 检查 Dockerfile distroless 使用率、固定 digest 覆盖率、SBOM 生成 |
| Q6  | Go engine 扩缩容能力（有状态/无状态）？           | engine-go 设计                       | 审查 engine-go server 中的 session/state 使用；确认可水平扩展    |

---

## 产出物结构

```
docs/macro-review/
├── 2026-07-06-macro-review-plan.md     # 本计划文档
├── 01-tech-stack-rationale.md          # 调研报告
├── 02-modularity.md
├── 03-coupling-and-deps.md
├── 04-data-flow-integrity.md
├── 05-evolvability.md
├── 06-tech-debt-panorama.md
├── 07-ops-maturity.md
└── SUMMARY.md                          # 综合结论 + 决策优先级矩阵
```

---

## 执行建议

| 切片      | 预估工时 | 可并行？      | 前置依赖                       |
| --------- | -------- | ------------- | ------------------------------ |
| 01 技术栈 | 2-3h     | ✅ 可独立     | 无                             |
| 02 模块化 | 3-4h     | ✅ 可独立     | 无                             |
| 03 耦合度 | 2h       | ✅ 可独立     | 运行 depcruise/madge（自动化） |
| 04 数据流 | 3-4h     | ✅ 可独立     | 无                             |
| 05 演进性 | 2-3h     | ✅ 可独立     | 需 01-04 结论最佳但不强制      |
| 06 全景   | 3h       | ❌ 需汇总其他 | 需 01-05 全部完成              |
| 07 运维   | 2-3h     | ✅ 可独立     | 无                             |

**推荐路线**: 01~05 + 07 并行 → 06 汇总 → SUMMARY 综合结论
