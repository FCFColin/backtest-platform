# 复杂度缩减计划

目标：降低复杂度、不增加行数（净行数 ≤ 0），不碰纯行数压缩。

## 已完成

- **analysis-orchestrator 信封收敛**：删 `assembleAnalysisResult`（23 行组装后路由立即解构拆回的反模式），`runAnalysis` 直接返回 `{data, warnings, dateRange}`（与 runCompute/runMonteCarlo 同仓一致），路由透传。净 ≈ −24。
- **网格计数算术化**：`grid-search.ts` 删 `generateParamValues` 数组构造，`countCombinations` 改算术计数；`jobRoutes` 内联 `Math.floor((max-min)/step)+1` 复用 `countCombinations`。净 ≈ −6。
- **DateField 共享组件**：`sharedFields.tsx` 新增 `DateField`，替换 7 处（14 个）内联 `<Input type="date">`（SignalParamsPanel×2、SignalSelector、PCAPage、LETFSlippagePage、FactorRegressionParams、EfficientFrontierParams）。净 ≈ −36。
- **RunButton 收敛**：`RunButton` 增加 `disabled` + `...rest` 透传，替换 3 处内联 loading 按钮（BacktestPage、backtestOptimizerComponents、RebalancingSensitivityPage）。净 ≈ −10。
- 测试同步：`runAnalysis` mock/断言更新为信封形状（行为契约不变，HTTP `json.data.tickers` 保持）。

## 已评估不适用（收益/风险比不足，跳过）

- optimize-service `runBacktest`/`makePortfolio` 提取：helper 样板抵消收益（净 ≈ 0）。
- Go `signal/generators.go` RSI/Bollinger 合并：阈值来源异构（标量 vs 逐点数组），净 ≈ 0。
- ParamCard vs LabeledField、StatCard vs KpiCard、`/errors` switch、computeTick/axes：样式/行为异构。
- AnalysisParams/OptimizerParams 日期：已是共享封装/表驱动。

## 验证

`pnpm exec tsc --noEmit`、`pnpm exec eslint packages/frontend/src packages/backend/src`、`pnpm exec vitest run tests/unit`（2464 passed）、改动文件 `prettier --write`。
