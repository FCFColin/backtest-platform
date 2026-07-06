# Go 引擎契约分析

## 背景

OpenAPI 规范 (`docs/openapi.yaml`) 此前仅记录了 Node.js API **对外暴露**的端点（路径前缀 `/api/v1/`），
未记录 Go 引擎 (`engine-go`) **内部**端点（路径前缀 `/api/engine/`）。

## 发现

### 对外端点（已有文档）

OpenAPI 中已记录的 `backtest` 组端点（Node.js 代理层）：

| OpenAPI 路径                        | 目标 Go 引擎端点                      |
| ----------------------------------- | ------------------------------------- |
| `POST /backtest/portfolio`          | `POST /api/engine/backtest`           |
| `POST /backtest/analysis`           | `POST /api/engine/analysis`           |
| `POST /backtest/optimize`           | `POST /api/engine/optimize`           |
| `POST /backtest/efficient-frontier` | `POST /api/engine/efficient-frontier` |
| `POST /backtest/monte-carlo`        | `POST /api/engine/monte-carlo`        |

### 缺失的内部端点

Go 引擎内部端点（`/api/engine/*`）**未**在 OpenAPI 中记录。内部端点由 `engine-go/internal/server/router.go` 定义。

### 请求形状差异

Go 引擎端点要求调用方传入已获取的 `priceData`（无状态设计），而对外端点由 Node.js 代理层先调用 `fetchHistoryData` 获取数据再转发：

| 字段                          | 对外端点 (Node.js)                                              | 内部端点 (Go)                      |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| `priceData`                   | 隐式获取，不暴露                                                | 显式必需，由调用方传入             |
| `cpiData`                     | 可选，自动从 DB 加载                                            | 可选，由调用方传入                 |
| `exchangeRates`               | 可选，自动从 DB 加载                                            | 可选，由调用方传入                 |
| `portfolios[].rebalanceBands` | `{ enabled, absoluteBand, relativeBand, upperBand, lowerBand }` | `{ absolute, relative }`（扁平化） |

### 认证差异

| 端点组                          | 认证方式                   |
| ------------------------------- | -------------------------- |
| 对外端点 (`/api/v1/backtest/*`) | JWT Bearer 或 x-api-key    |
| 内部端点 (`/api/engine/*`)      | X-Engine-Auth header token |

### 已采取的行动

1. 在 `docs/openapi.yaml` 新增 `engine-go` tag
2. 在 `components/schemas` 新增 `EngineBacktestParams` 和 `EngineBacktestResponse` schema
3. 在 `paths` 新增 5 个 Go 引擎内部端点文档：
   - `POST /api/engine/backtest`
   - `POST /api/engine/analysis`
   - `POST /api/engine/optimize`
   - `POST /api/engine/efficient-frontier`
   - `POST /api/engine/monte-carlo`

### 建议

1. **生成客户端**：考虑使用 OpenAPI Generator 为 Go 引擎生成 TypeScript 客户端类型，消除 `callEngineStrict` 中的 `as unknown` 类型断言
2. **版本同步**：Go 引擎请求结构变更时，OpenAPI 规范需同步更新——建议在 CI 中增加 OpenAPI diff 检查
3. **错误格式统一**：Go 引擎内部错误格式目前不统一（部分返回 `{ success: false, error: string }`，部分返回纯 HTTP 错误），应统一为 RFC 7807 格式以匹配 Node.js 层
4. **Go 引擎健康端点**：`GET /api/engine/health` 应加入 OpenAPI（已有，未记录）
