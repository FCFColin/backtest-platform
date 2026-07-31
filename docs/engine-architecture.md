# 引擎架构说明

## 计算路径分类

### Go-canonical（HTTP → Go 引擎）

组合回测、蒙特卡洛、组合优化、有效前沿、单资产分析、**统计指标计算**。
路由 → application 层 → `callEngineStrict()` → Go engine (`engine-go:5004`)。不可用 fail-closed 503（ADR-031），不回退 Node。

### Node-canonical（路由直接计算）

tactical / tacticalGrid / signal / goalOptimizer / pca / letf——含 Go 引擎不覆盖的业务逻辑（信号钩子、自定义再平衡、网格搜索），Node 是权威实现，非降级路径。

> **注**：统计指标已统一到 Go 引擎。Node-canonical 经 `utils/engineClient.ts` 调 `/api/engine/statistics` 获取，原 `statistics.ts`（~684 行）已删除。

## 文件分层

### 领域层（Node-canonical 入口）

| 文件                              | 职责                           |
| --------------------------------- | ------------------------------ |
| `tactical.ts` / `tacticalGrid.ts` | 战术分配回测 / 战术网格搜索    |
| `signal.ts` / `goalOptimizer.ts`  | 信号分析（单/双/多）/ 目标优化 |
| `pca.ts` / `letf.ts`              | 主成分分析 / LETF 滑点         |

### 共享计算核心（被领域层依赖）

| 文件                                             | 职责                                            |
| ------------------------------------------------ | ----------------------------------------------- |
| `backtestRunner.ts`                              | Node-canonical 回测执行器（tactical/grid 专用） |
| `utils/engineClient.ts`                          | Go 引擎 HTTP 客户端（统计指标经此调用）         |
| `growthCurve.ts` / `rebalance.ts`                | 增长曲线（再平衡、通胀调整）/ 再平衡触发        |
| `correlation.ts` / `tickerAnalysis.ts`           | 相关性矩阵 / 单标的分析                         |
| `curveReturns.ts` / `drag.ts` / `seriesUtils.ts` | 收益率序列 / 拖累因子 / 序列转换                |
