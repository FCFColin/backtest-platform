# data-fetcher

Go 行情/宏观数据服务（gin + pgx）。ADR-008 降级语义：DB 缺失 ticker 时实时拉取上游并落库，缺失区间带 `degraded` 标记返回（Compute 可透传，Engine fail-closed 不涉及）。

## 运行

- 启动：`go run .`（入口 `main.go`）；端口 `DATA_FETCHER_PORT`（默认 `5003`，docker-compose 映射宿主 `127.0.0.1:15003:5003`）
- 认证：`X-Data-Service-Auth` 头 + `DATA_SERVICE_AUTH_TOKEN`（SharedTokenAuthMiddleware）；数据端点限流 60 req/min（health/ready/metrics 不受限）
- 依赖：`DATABASE_URL`（PostgreSQL）；`FRED_API_KEY`（treasury refresh 用，缺失时 refresh 端点 503 fail-closed）
- 端点：
  - `GET /api/data/health`、`GET /api/ready`、`GET /metrics`（免认证）
  - `GET /api/data/search`、`GET /api/data/price/:ticker`、`POST /api/data/price/batch`、`GET /api/data/cpi/:country`、`GET /api/data/treasury/:series`、`POST /api/data/treasury/:series/refresh`（认证）

## 包结构（internal/）

| 包 | 职责 |
| --- | --- |
| `provider` | Provider 接口 + Registry（`DATA_PROVIDER_PRIORITY` 优先级链，默认 `sim,yfinance,finnhub,twelvedata,akshare`）；registry.go 顶部注释块为复权状态登记的权威位置（R-12） |
| `sim` / `yfinance` / `finnhub` / `twelvedata` / `akshare` | 各上游数据源实现；`sim` 为合成确定性数据（测试/演示用） |
| `fred` | FRED 利率序列客户端（U-2 Phase 1，DGS3MO 等，百分数→小数归一） |
| `store` | pgx 数据面：GetPriceData（DB 优先→实时抓取降级，返回 degraded 标记）、RefreshPriceData（强制刷新）、SearchTickers、GetCPI、TreasuryRates upsert/read |
| `handlers` | gin handler（price/batch/cpi/treasury/search + health/ready），degraded 字段在响应可见 |
| `httpclient` | 带命名的共享 HTTP 客户端 |
| `middleware` | CORS 构建 |
| `registry` | 组装 Provider 注册表（优先级环境变量解析） |
| `version` | 版本注入 |
| `provider/testutil` | Provider 测试夹具 |

## 复权语义（R-12 红线）

- `AdjustedClose` 为 `*float64`：**仅当源明确提供复权口径时写入**（yfinance adjclose 列；twelvedata `adjust=split` 拆股调整；sim 合成已复权）
- finnhub candle / akshare 日线为未复权价 → AdjustedClose 置 `nil`（落库 NULL，禁止用 Close 冒充）；消费端 `adjusted_close ?? close` 回退
- 新增数据源必须在 `internal/provider/registry.go` 注释块登记复权状态

## 测试

```sh
go test ./...          # 全量（11 包）
go test -race ./...    # 竞态检测
go test -bench=. -benchmem ./...   # 基准（nightly）
gofmt -l . && go vet ./...         # 静态检查
```
