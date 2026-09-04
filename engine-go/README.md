# engine-go

多资产组合回测唯一计算引擎（gin + gonum）。ADR-008：引擎不可用时 fail-closed 返回 503 + `Retry-After`，不做静默降级。

## 运行

- 启动：`go run ./cmd/server`；端口 `ENGINE_GO_PORT`（默认 `5004`，docker-compose 映射宿主 `127.0.0.1:15004:5004`）
- 认证：`X-Engine-Auth` 头 + `ENGINE_AUTH_TOKEN`（SharedTokenAuthMiddleware）；计算端点附 IP 限流（0.5 rps，burst 30）与并发上限
- 端点：
  - `GET /api/engine/health`、`GET /api/ready`、`GET /metrics`（免认证）
  - `POST /api/engine/{backtest,analysis,optimize,efficient-frontier,monte-carlo,signal-analyze,pca,letf-analyze,goal-optimize,tactical-backtest,tactical-grid-search,factor-regression,calculators}`（认证 + 10MB body 上限 + 90s 计算超时）

## 包结构（internal/）

| 包 | 职责 |
| --- | --- |
| `engine` | 回测核心（日频组合演化、现金流、回撤episode、战术信号 `engine/tactical`、H-1 高级指标 PSR/Hurst/Burke/Martin/Sterling/M² 等） |
| `montecarlo` | 确定性 MC：block bootstrap（min/max 块长）+ 估计法菜单（historical/trimmed/ewWeighted） |
| `optimizer` | 均值-方差优化（min-vol/max-Sharpe/max-return，闭式+数值双路） |
| `goaloptimizer` | 目标导向优化（蒙特卡洛成功率、确定性可复现） |
| `analysis` | PCA、LETF 滑点分析 |
| `signal` | 战术信号分析（single/dual/multi 模式、point-in-time 胜率） |
| `calculators` | 独立工具计算器（CAGR/SWR/两基金有效前沿） |
| `indicators` | SMA/EMA/RSI/MACD/Bollinger 技术指标 |
| `mathutil` | 统计原语（Sum/Percentile/DownsideDeviation/DailyReturns 等，golden 锁定的底层） |
| `engineutil` | 输入校验/InputError/rf 口径（FRED 日频优先 → 用户显式其次 → legacy const 兜底，U-2） |
| `server` / `middleware` | gin 路由、Problem+JSON 错误、OTel span、认证限流中间件 |
| `version` | 版本注入 |
| `enginetest` | 测试夹具（PriceData/ThreeTickerData 等确定性价格构造器，`/** @internal */ testExports` 语义的 Go 对应物） |

## golden 机制（R-04 字节级门禁）

- 基线：`testdata/statistics_golden.json`，由 `internal/engine/statistics_goldenfile_test.go` 的 `TestStatisticsGoldenFile` 以固定字面量收益序列锁定统计函数的浮点输出（ULP 级，与 `statistics_golden_test.go` 的 1e-6 语义断言互补）
- 跑门禁：`go test ./internal/engine -run TestStatisticsGoldenFile -v`
- 重基线（仅限用户明示授权，CI 要求提交标题含 `[golden]` 标记）：

  ```sh
  go test ./internal/engine -run TestStatisticsGoldenFile -update-golden
  ```

- 禁止用 `-update-golden` 掩盖未归因偏差；失败先做 ULP 偏差分析再裁决

## 测试

```sh
go test ./...                 # 全量（16 包）
go test -race ./...           # 竞态检测
go test -bench=. -benchmem ./...   # 基准（nightly）
gofmt -l . && go vet ./...    # 静态检查
```
