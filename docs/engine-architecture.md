# 引擎架构说明

## 计算路径分类

### Go-canonical（HTTP → Go 引擎）

组合回测、蒙特卡洛、组合优化、有效前沿、单资产分析、**统计指标计算**。
路由 → application 层 → `callEngineStrict()` → Go engine (`engine-go:5004`)。不可用 fail-closed 503（ADR-031），不回退 Node。

### Node-canonical（路由直接计算）

tactical / tacticalGrid / signal / goalOptimizer / pca / letf——含 Go 引擎不覆盖的业务逻辑（信号钩子、自定义再平衡、网格搜索），Node 是权威实现，非降级路径。

> **注**：统计指标已统一到 Go 引擎。Node-canonical 经 `utils/engineClient.ts` 调 `/api/engine/statistics` 获取，原 `statistics.ts`（~684 行）已删除。

Node-canonical 业务逻辑位于 `packages/backend/src/application/`（tactical-application-service、signal-orchestrator、goalOptimizer、pca、letf 等），共享计算在 `domain/services/` 与 `utils/engineClient.ts`。
