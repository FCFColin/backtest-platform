# ADR-043: baostock 直连与 Provider Registry 双通路职责分离

> **企业理由**：data-fetcher 同时承载两类数据访问职责——面向用户的 A 股实时查询（baostock TCP 直连）与
> 面向离线批量抓取的多源数据回填（Provider Registry 多 HTTP 源降级链）。两者在协议模型、连接生命周期、
> ticker 格式、返回类型、认证方式上存在根本差异。强制将 baostock 封装为 Provider 会导致连接管理混乱、
> 性能回退、抽象泄漏。本 ADR 明确两条通路为不同职责，应分别演进而非强行统一。

| 字段   | 值                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------- |
| 状态   | 已实施                                                                                              |
| 日期   | 2026-07-17                                                                                          |
| 决策者 | 架构组                                                                                              |
| 范围   | data-fetcher 主服务（main.go + handlers_baostock.go）+ data-fetcher/cmd/worker（Provider Registry） |
| 关联   | ADR-008（Go + TypeScript 架构）、ADR-016（熔断器策略）、ADR-031（fail-closed 降级）                 |

## 决策

**不将 baostock 封装为 Provider 接口实现，保持现有双通路架构：**

- **主服务通路（main.go）**：`/api/baostock/*` HTTP 端点通过 `handlers_baostock.go` 的 `withBaoStockClient`
  直接调用 `baostock.Client`，每次请求完成 Connect → Login → Query → Close 全生命周期，由 `baoStockBreaker`
  熔断器保护（gobreaker，5 次连续失败或 >50% 失败率触发）。承担 A 股实时查询、K 线、股票列表、交易日历等
  用户驱动的低延迟交互式请求。

- **worker 通路（cmd/worker/main.go）**：批量抓取通过 `provider.Registry` + `FetchWithFallback` 降级链
  依次尝试 yfinance / finnhub / twelvedata / akshare。A 股标的由 `Registry.ForTicker` 路由到 akshare
  （东方财富 HTTP API），承担离线全量/增量数据回填到 PostgreSQL 的批处理任务。

## 评估依据

baostock 与 Provider 接口存在五项根本性差异，无法干净适配：

### 1. 连接生命周期不匹配

Provider 接口的方法签名 `FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error)` 隐含
**无状态单次调用**语义。baostock 则要求四步有状态序列：

```go
client := baostock.NewClient()
client.Connect()   // TCP dial，10s 超时
client.Login()     // 发送登录消息，解析响应
client.QueryHistoryKDataPlus(...)  // 实际查询
client.Close()     // 发送 logout，关闭 conn
```

适配方案的两难：

- **每次请求新建连接**：TCP 握手 + 登录往返约 200-400ms 额外延迟，对实时查询不可接受；且 baostock 服务端
  会对高频连接建立做限流。
- **保持单例长连接**：Provider 接口未暴露 `Init()` / `Close()` 生命周期钩子，无法在 Registry 层管理连接池；
  连接断开后的重连、login state 失效处理无处安放。

### 2. Ticker 格式不匹配

- Provider 生态使用 `000001_SZ` / `000001.SZ` / `AAPL` 格式（参考 akshare `parseCodeAndMarket`）
- `Registry.ForTicker` 通过 `.SZ/.SH/_SZ/_SH` 后缀路由 A 股
- baostock 原生 API 要求 `sh.600000` / `sz.000001` 格式（小写前缀 + 点号）

若强行适配，每个 `FetchStockDaily` 调用都需要做 ticker 翻译，且翻译规则与 akshare 的 `_SZ↔0` /
`_SH↔1` 完全不同，引入额外复杂度与潜在不一致。

### 3. 返回类型不匹配

- Provider `FetchStockDaily` 返回 `[]DailyPrice`（强类型：`Date string`、`Open float64` 等）
- baostock `QueryHistoryKDataPlus` 返回 `[]map[string]string`（弱类型字符串，且分页拉取）

适配器需承担：分页合并、字符串→float64 解析（含错误处理）、字段名映射（baostock 字段名由调用方
`fields` 参数动态指定），这些与 Provider 接口"统一返回类型"的初衷相悖。

### 4. 认证模型不匹配

- HTTP 类 Provider（finnhub/twelvedata）通过请求头/API key 鉴权，yfinance/akshare 无鉴权
- baostock 需显式 `Login(userID="anonymous", password="123456")`，且登录态绑定到 TCP 连接

Provider 接口未定义 `SetCredentials` / `Login` 方法，强行扩展会污染所有现有 Provider 实现。

### 5. 运营职责本就不同（核心论据）

| 维度     | 主服务通路（baostock 直连）        | worker 通路（Provider Registry）          |
| -------- | ---------------------------------- | ----------------------------------------- |
| 触发方   | 用户 HTTP 请求                     | 定时/手动批处理任务                       |
| 延迟要求 | 低延迟（交互式）                   | 高吞吐（批处理）                          |
| 数据流向 | baostock → HTTP 响应（不持久化）   | Provider → PostgreSQL（持久化）           |
| 失败策略 | 熔断器 fail-closed 503             | 多源降级 fallback                         |
| 数据范围 | A 股实时（K 线/股票列表/交易日历） | 美股/全球/A 股历史（akshare 已覆盖 A 股） |
| 并发模型 | 每请求独立连接 + 熔断器            | 共享 HTTP client + 限流                   |

**akshare 已在 worker 的 Provider Registry 中承担 A 股批量抓取职责**（参考 `cmd/worker/main.go:168`
默认优先级 `["yfinance", "finnhub", "twelvedata", "akshare"]` 与 `registry.go:36` `ForTicker` 的
`.SZ/.SH` 路由）。若将 baostock 也注册为 Provider，会出现两个 A 股 Provider 职责重叠——akshare 走 HTTP
适合批量，baostock 走 TCP 适合实时——但 Provider 接口无法表达这种"按使用场景选择"的语义，只能按
`priorities` 顺序降级，反而模糊了边界。

## 实施状态

当前代码库已符合本 ADR 决策：

- `data-fetcher/handlers_baostock.go`：保留 `baoStockBreaker` + `withBaoStockClient` + 4 个
  `handleBaoStock*` HTTP handler，直接调用 `baostock.Client`
- `data-fetcher/cmd/worker/main.go`：保留 `provider.Registry` 注册 yfinance/finnhub/twelvedata/akshare
- `data-fetcher/internal/provider/registry.go`：`ForTicker` 对 A 股 ticker 优先返回 akshare，baostock
  不在 Registry 中

## 风险与缓解

| 风险                                     | 缓解措施                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| 两条通路代码风格不一致                   | 主服务使用 gin handler + gobreaker；worker 使用 Registry + FetchWithFallback，各循其惯例 |
| baostock 服务不可用时 A 股实时查询全失败 | `baoStockBreaker` 熔断后返回 503 + Retry-After（ADR-031 fail-closed 模式）               |
| 未来若需 baostock 批量抓取               | 可在 worker 中独立实现 baostock batch fetcher（不通过 Provider 接口）                    |
| akshare 与 baostock 数据口径差异         | 文档化：主服务返回 baostock 口径，worker 持久化 akshare 口径；查询历史数据走 PostgreSQL  |

## 替代方案

**方案 A（已否决）**：将 baostock 封装为 Provider 并注册到 Registry。

否决理由：上述五项差异中任何一项都足以否定该方案；综合则会导致 Provider 抽象的本质（统一无状态接口）
被破坏，且无法带来收益——akshare 已覆盖 A 股批量场景，baostock 直连已覆盖 A 股实时场景，强行统一
反而引入抽象泄漏。

**方案 C（已否决）**：扩展 Provider 接口，新增 `Connect()` / `Login()` / `Close()` 生命周期方法。

否决理由：所有现有 HTTP Provider 不需要这些方法，强制实现会导致 no-op 实现泛滥；且接口扩展会破坏
Provider "单一职责=拉取数据"的语义边界。
