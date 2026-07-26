# P4-2: 前端状态管理架构评估报告

> 生成日期：2026-07-26 | 状态：调研完成，XState PoC 已产出 | 决策建议：**选择性引入 TanStack Query，useBacktestWs 暂不重写**

## 1. 现状概述

### 1.1 状态管理工具栈

- **全局状态**：Zustand（5 个 Slice：authStore, executionSlice, 等）
- **服务端状态**：直接 fetch + useAsyncAction/useComputeTool 封装
- **WebSocket**：useBacktestWs（420 行，7 个 useCallback + 2 个 useEffect）
- **主题**：useTheme（localStorage + data-theme 属性）

### 1.2 工具页面状态分类

对 20 个工具页面进行状态依赖分析：

| 页面                       | 状态类型           | 跨页面共享？   | Zustand 使用 | 适合 TanStack Query？ |
| -------------------------- | ------------------ | -------------- | ------------ | --------------------- |
| BacktestPage               | 服务端+本地        | executionSlice | ✅           | ✅ 高                 |
| MonteCarloPage             | 服务端+本地        | 否             | ❌           | ✅ 高                 |
| OptimizerPage              | 服务端+本地        | 否             | ❌           | ✅ 高                 |
| EfficientFrontierPage      | 服务端+本地        | 否             | ❌           | ✅ 高                 |
| AnalysisPage               | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| TacticalPage               | 服务端+本地+持久化 | 否             | ❌           | ✅ 高                 |
| SignalPage                 | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| LETFSlippagePage           | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| FactorRegressionPage       | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| GoalOptimizerPage          | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| PCAPage                    | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| TacticalGridPage           | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| LumpSumDCAPage             | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| RebalancingSensitivityPage | 服务端+本地        | 否             | ❌           | ✅ 中                 |
| DataEnginePage             | 服务端             | 否             | ❌           | ✅ 高                 |
| AdminDashboard             | 服务端             | authStore      | ✅           | ✅ 高                 |
| AccountPage                | 服务端             | authStore      | ✅           | ✅ 高                 |
| BillingPage                | 服务端             | authStore      | ✅           | ✅ 高                 |
| PricingPage                | 静态               | 否             | ❌           | ❌                    |
| HelpPage                   | 静态               | 否             | ❌           | ❌                    |

**关键发现**：15/20 个页面的状态是完全局部的，不跨页面共享。这些页面直接使用 useAsyncAction 而非 Zustand，说明 Zustand 主要用于全局认证状态。

## 2. useBacktestWs 复杂度分析

### 2.1 代码结构

```
useBacktestWs (420 行)
├── parseWsMessage()          — WS 消息解析
├── parsePollingData()        — 轮询响应解析
├── wireWsHandlers()          — WS 事件绑定
├── handleWsClose()           — close 事件处理（重连/降级）
├── exponentialDelay()        — 指数退避计算
├── buildWsUrl()              — URL 构造
├── cleanupWs() (useCallback)  — WS 清理
├── cleanupPolling() (useCallback) — 轮询清理
├── applyProgress() (useCallback)  — 进度应用
├── pollOnce() (useCallback)      — 单次轮询
├── startPolling() (useCallback)  — 启动轮询
├── connectWs() (useCallback)     — 建立 WS
├── reconnect() (useCallback)    — 手动重连
├── useEffect (mount/unmount)
└── useEffect (jobId 变化)
```

### 2.2 状态机视角

当前隐式状态机：

```
idle → connecting → connected → receiving → terminal(completed/failed)
                    ↓ (error)                ↓ (error)
                  reconnecting              reconnecting
                    ↓ (max retries)           ↓
                  polling → receiving → terminal
```

问题：状态转换逻辑分散在 `wireWsHandlers` / `handleWsClose` / `connectWs` / `startPolling` 中，无集中定义，难以推理所有路径。

### 2.3 XState PoC 对比

已产出 `packages/frontend/src/hooks/useBacktestWsXState.ts`，用 XState 状态机重写核心逻辑。

| 维度     | 原 Hook (420行)            | XState PoC (~200行)             |
| -------- | -------------------------- | ------------------------------- |
| 状态定义 | 隐式（散布在 useCallback） | 集中（states + transitions）    |
| 可测试性 | 需 mock WebSocket + timers | 纯状态机可单元测试              |
| 可视化   | 无                         | XState Visualizer 可导出        |
| 包大小   | 0 KB（原生）               | ~30KB（xstate + @xstate/react） |
| 学习曲线 | 标准 React                 | XState DSL 需学习               |

## 3. TanStack Query 评估

### 3.1 收益

- **自动缓存/去重**：同一 key 的并发请求自动去重
- **后台刷新**：窗口聚焦时自动重新获取
- **乐观更新**：内置乐观更新机制
- **DevTools**：请求/缓存可视化

### 3.2 成本

- 包大小：~13KB（gzipped）
- 学习曲线：query key 设计、staleTime/GCTime 调优
- 与现有 useAsyncAction 的迁移成本

### 3.3 建议

**选择性引入**：仅对高频数据获取场景引入（如 AdminDashboard 的服务状态查询、DataEnginePage 的统计查询），而非全量替换。

## 4. 决策建议

### 4.1 useBacktestWs：暂不重写

**理由**：

1. 当前实现已通过完整测试（7 个场景覆盖重连/降级/终态）
2. XState PoC 行数减少不显著（420→200），但引入 30KB 依赖
3. WS 生命周期管理的复杂度是固有的，XState 只是换一种组织方式

### 4.2 TanStack Query：选择性引入

**触发条件**：

1. AdminDashboard 需要自动刷新服务状态（当前手动 setInterval）
2. 多个页面共享同一 API 数据（缓存去重收益）
3. 需要乐观更新（如保存配置后即时 UI 反馈）

### 4.3 Zustand：维持现状

Zustand 在全局认证状态管理上表现良好，5 个 Slice 的复杂度在可控范围内。无需引入 Redux/Valtio 等更重的方案。

---

_本报告基于代码库 commit 2427c35 的实际架构分析_
