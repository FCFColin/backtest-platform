# 引擎架构说明

## 计算路径分类

### Go-canonical（走 HTTP → Go 引擎）

组合回测、蒙特卡洛、组合优化、有效前沿、单资产分析、**统计指标计算**。

路由 → application 层 → `callEngineStrict()` → Go engine HTTP API (`engine-go:5004`)

Go 引擎不可用时 fail-closed 返回 503（ADR-031），不回退到 Node。

### Node-canonical（路由直接计算）

tactical / tacticalGrid / signal / goalOptimizer / pca / letf。

这些功能含 Go 引擎不覆盖的业务逻辑（信号钩子、自定义再平衡、网格搜索等），Node 是权威实现，非降级路径。

> **注**：统计指标计算已统一到 Go 引擎。Node-canonical 路径通过 `packages/backend/src/utils/engineClient.ts` 调用 Go 引擎的 `/api/engine/statistics` 端点获取统计结果，原 `statistics.ts`（~684 行 TS）已删除。

## 文件分层

### 领域层（Node-canonical 入口）

| 文件               | 职责                     |
| ------------------ | ------------------------ |
| `tactical.ts`      | 战术分配回测             |
| `tacticalGrid.ts`  | 战术网格搜索             |
| `signal.ts`        | 信号分析（单/双/多信号） |
| `goalOptimizer.ts` | 目标优化器               |
| `pca.ts`           | 主成分分析               |
| `letf.ts`          | LETF 滑点分析            |

### 共享计算核心（被领域层依赖）

| 文件                                         | 职责                                                    |
| -------------------------------------------- | ------------------------------------------------------- |
| `backtestRunner.ts`                          | Node-canonical 回测执行器（tactical/tacticalGrid 专用） |
| `packages/backend/src/utils/engineClient.ts` | Go 引擎 HTTP 客户端（统计指标计算经此调用）             |     |
| `growthCurve.ts`                             | 增长曲线构建（含再平衡、通胀调整）                      |
| `rebalance.ts`                               | 再平衡触发判断                                          |
| `correlation.ts`                             | 相关性矩阵                                              |
| `tickerAnalysis.ts`                          | 单标的分析                                              |
| `curveReturns.ts`                            | 收益率序列工具                                          |
| `drag.ts`                                    | 拖累因子计算                                            |
| `seriesUtils.ts`                             | 价格/收益序列转换                                       |
