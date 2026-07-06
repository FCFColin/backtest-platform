# backtestRoutes.ts 拆分计划

## 现状

`packages/backend/src/routes/backtestRoutes.ts` 共 528 行，包含 7 个路由处理器：

| 行号 | 路由                       | 处理器              | 复杂度           |
| ---- | -------------------------- | ------------------- | ---------------- |
| ~146 | `GET /search`              | ticker 搜索         | 小               |
| ~171 | `POST /portfolio`          | 组合回测（主逻辑）  | **大（~80 行）** |
| ~262 | `POST /portfolio/series`   | 从缓存补全 tab 序列 | 小               |
| ~302 | `POST /analysis`           | 单资产分析          | 中               |
| ~361 | `POST /monte-carlo`        | 蒙特卡洛模拟        | 中               |
| ~418 | `POST /optimize`           | 组合优化            | 中               |
| ~464 | `POST /efficient-frontier` | 有效前沿            | 中               |

## 共享依赖

拆分前需提取的公共函数（当前在 `backtestRoutes.ts` 中内联定义）：

| 函数                           | 用途                       | 建议去向                                  |
| ------------------------------ | -------------------------- | ----------------------------------------- |
| `handleEngineUnavailable`      | 503 + Retry-After 错误处理 | 共享工具 → `utils/engineClient.ts`        |
| `filterPriceData`              | 按 ticker 集合过滤价格数据 | 共享工具 → `utils/engineClient.ts` 或保留 |
| `checkTickerLimit`             | 验证 ticker 上限           | 共享工具 → 新的 `utils/routeHelpers.ts`   |
| `fetchPriceData`               | 带超时的数据获取           | 共享工具 → `utils/routeHelpers.ts`        |
| `fetchPriceDataWithDegraded`   | 带降级标记的数据获取       | 共享工具 → `utils/routeHelpers.ts`        |
| `loadMacroData`                | 加载 CPI + 汇率            | 保持不变（引用范围窄）                    |
| `sanitizeMcParams`             | 白名单过滤蒙特卡洛参数     | 共享工具 → `utils/routeHelpers.ts`        |
| `collectTickersFromPortfolios` | 收集组合中的唯一 ticker    | 共享工具 → `utils/routeHelpers.ts`        |

## 建议拆分方案

### 方案 A：按计算类型分文件（推荐）

```
src/routes/backtest/
├── index.ts              # 将各路由挂载到 /api/backtest（Router 合并）
├── backtestSearchRoutes.ts      # GET /search
├── backtestPortfolioRoutes.ts   # POST /portfolio, POST /portfolio/series
├── backtestAnalysisRoutes.ts    # POST /analysis
├── backtestMonteCarloRoutes.ts  # POST /monte-carlo
├── backtestOptimizeRoutes.ts    # POST /optimize
├── backtestEfficientFrontierRoutes.ts  # POST /efficient-frontier
```

**优点**：每个文件聚焦一种计算类型，职责清晰
**缺点**：文件多（7 个），公共 helper 提取略繁琐

### 方案 B：分 3 组文件（折衷）

```
src/routes/backtest/
├── index.ts              # Router 合并 + 导入各子路由
├── backtestCoreRoutes.ts         # POST /portfolio, /portfolio/series（核心回测）
├── backtestAnalysisRoutes.ts     # POST /analysis, /optimize, /efficient-frontier（分析类）
├── backtestMonteCarloRoutes.ts   # POST /monte-carlo（蒙特卡洛独有）
├── backtestSearchRoutes.ts       # GET /search（查询类）
```

### 方案 C：保留单体，仅提取公共 helper（最小改动）

```
src/routes/backtestRoutes.ts     # 保留，但提取 helper 到共享模块
src/utils/routeHelpers.ts        # 提取所有公共函数
```

## 依赖注入模式

所有计算处理器均遵循相同模板：

```
validate(schema)
  → fetchPriceData (with degraded)
  → callEngineStrict(/api/engine/...)
  → compress/transform result
  → res.json({ success, data, degraded?, warnings? })
```

这个模式可以抽象为高阶函数减少重复：

```typescript
function createComputeHandler<T>(config: {
  schema: ZodSchema;
  endpoint: string;
  buildBody: (req: Request) => T;
  transformResult?: (result: unknown) => unknown;
}) { ... }
```

但当前重复度尚可接受，过早抽象可能降低可读性。

## 推荐行动步骤

1. **创建** `src/utils/routeHelpers.ts`，提取：
   - `checkTickerLimit`
   - `fetchPriceData` / `fetchPriceDataWithDegraded`
   - `sanitizeMcParams`
   - `collectTickersFromPortfolios`
   - `loadMacroData`

2. **将** `handleEngineUnavailable` 移至 `utils/engineClient.ts`

3. **按方案 B** 创建子文件（`backtestCoreRoutes.ts`、`backtestAnalysisRoutes.ts`、`backtestMonteCarloRoutes.ts`、`backtestSearchRoutes.ts`）

4. **保持** `backtestRoutes.ts` 作为入口 re-export，避免破坏导入链

5. **测试验证**：`npm run check && npm run test -- --grep backtest`

## 风险

- `compressBacktestResultForSync` / `extractBacktestSeries` 来自 `../utils/compressBacktestResult.js`——导入路径需调整
- `portfolioBacktestSchema` 等 schema 已在 `../schemas/backtest.js` 中——无需移动
- `callEngineStrict` 导入路径不变
- 拆分后需确保各子 router 挂载到正确路径前缀 (`/api/backtest`)
