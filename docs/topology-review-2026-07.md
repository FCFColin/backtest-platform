# 服务拓扑评估报告 2026-07

## 当前拓扑

```
Browser (React SPA :5176)
    │ HTTP /api/*
    ▼
Express API (:5001)
    ├── Go Engine (:5004) — 主计算引擎（Go 1.25，gin）
    ├── Go Data Service (:5003) — 主数据服务（Go 1.26，gin）
    ├── PostgreSQL (:5432) — 主数据库
    └── Redis (:6379) — 缓存、认证、队列
```

## 评估问题

### Q1: engine-go + data-fetcher 能否合并？

**分析：**

| 维度 | engine-go | data-fetcher |
|------|-----------|-------------|
| Go 版本 | 1.25 | 1.26 |
| 主要依赖 | gin, gonum | gin, pgx, baostock, finnhub |
| 功能 | 回测/MC/优化/前沿计算 | 行情/基本面/搜索数据获取 |
| 部署方式 | 独立二进制/容器 | 独立二进制/容器 |
| 资源需求 | CPU 密集型（蒙特卡洛） | I/O 密集型（网络+DB） |

**评估结论：不建议合并。** 理由：
1. 资源需求不同：引擎是 CPU 密集型（蒙特卡洛并行计算），数据服务是 I/O 密集型（网络请求 + 数据库）。合并后扩缩容无法独立。
2. 依赖不同：引擎依赖 gonum（科学计算），数据服务依赖 pgx 和多个外部数据 SDK。合并增大镜像体积。
3. 构建速度：独立构建约 2min 每个，合并后单次构建可能 >5min。
4. 故障隔离：引擎不可用应返回 503（fail-closed），数据服务不可用可降级到 PostgreSQL。合并后会丢失这种隔离。

**建议：保持分离。** 但统一 Go 版本（选用 1.26）。

### Q2: Node-canonical engine（api/engine/）是否应独立为 service？

**分析：**
- api/engine/ 包含 tactical、signal、goalOptimizer、PCA、LETF 等函数
- 当前与 Express API 代码混在同一进程中
- 这些是 Node-canonical（Node 唯一权威实现），与 Go 引擎的职责不同

**评估结论：暂不建议独立。** 理由：
1. 这些函数是纯计算逻辑，无状态，适合独立但不紧急
2. 当前 Express API 进程资源充足，分离带来的好处有限
3. 分离会增加一个服务的管理成本（部署、监控、告警）
4. 保留在 Express 进程中减少一次网络调用延迟

**建议：保持现状，但将 api/engine/ 代码组织为独立的内部模块（已有），未来如果性能成为瓶颈再考虑独立。**

### Q3: 当前拓扑痛点清单

1. Go 版本不一致（1.25 vs 1.26）：增加维护负担，应统一
2. api/ + packages/ 双目录结构：迁移过程中，代码分散在两处，增加认知负荷
3. 4 个独立服务意味着 4 个 Dockerfile、4 个 K8s deployment、4 个 HPA 配置
4. data-fetcher 的 Python 数据 CLI 已退休但仍有 501 端点（`dataRoutes.ts` 中的历史遗留）
5. 服务间认证使用静态 token（ENGINE_AUTH_TOKEN/DATA_SERVICE_AUTH_TOKEN），不便于轮换

## 建议行动项

| 优先级 | 行动 | 收益 |
|--------|------|------|
| P0 | 统一 engine-go 和 data-fetcher 的 Go 版本至 1.26 | 消除构建环境分裂 |
| P1 | 完成 monorepo 迁移（淘汰 flat api/ 结构） | 单一代码组织方式 |
| P2 | 服务间认证从静态 token 迁移到 mTLS 或短期 JWT | 安全最佳实践 |
| P3 | 评估 data-fetcher Python 遗留端点的退役计划 | 减少维护范围 |
