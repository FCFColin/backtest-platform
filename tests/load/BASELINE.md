# k6 负载测试性能基线 (BASELINE)

> P2-06 — 回测平台 k6 负载测试基线文档。
> 本文件定义各场景的预期延迟分位数（P50/P95/P99）、SLA 目标、运行方式与回归判定规则。
> 夜间 k6 CI（`.github/workflows/load-test.yml`）将实测结果与本基线对比，回归 >20% 时告警。

## 1. 场景与 SLA 目标

| 场景         | 脚本                 | 并发 VUs | 持续 | SLA (P99) | 错误率 |
| ------------ | -------------------- | -------- | ---- | --------- | ------ |
| 回测提交     | `backtest-submit.js` | 100      | 3m   | < 500ms   | < 5%   |
| 价格历史读取 | `price-history.js`   | 500      | 2m   | < 200ms   | < 5%   |
| 优化器提交   | `optimizer.js`       | 50       | 2m   | < 300ms   | < 5%   |

## 2. 预期延迟分位数（基线值）

以下为本地开发环境（PostgreSQL + Redis 单实例，无外部数据源降级）下的预期基线。
首次运行后将实测值填入「实测基线」列，作为后续回归对比的锚点。

### 2.1 回测提交 (`backtest-submit.js`)

POST `/api/v1/backtest/portfolio` — 异步入队路径（202 Accepted）。

| 分位数 | 预期基线      | 实测基线 (2026-07-30) |
| ------ | ------------- | --------------------- |
| P50    | 60ms          | _需 Docker 全栈测试_  |
| P95    | 200ms         | _需 Docker 全栈测试_  |
| P99    | < 500ms (SLA) | _需 Docker 全栈测试_  |

**关注点**：入队延迟主要消耗在请求体校验（Zod）与 BullMQ `add`。队列不可用时
降级为同步执行，P99 会显著上升（>2s），此时应检查 Redis 可用性。

### 2.2 价格历史读取 (`price-history.js`)

GET `/api/v1/prices/:ticker?startDate=&endDate=` — 读路径（Redis 缓存 + 只读副本）。

| 分位数 | 预期基线      | 实测基线 |
| ------ | ------------- | -------- |
| P50    | 25ms          | _待填_   |
| P95    | 100ms         | _待填_   |
| P99    | < 200ms (SLA) | _待填_   |

**关注点**：缓存命中时 P99 应远低于 SLA；缓存未命中穿透到 Postgres 只读副本时
P95 可达 150ms。若 P99 > 200ms，检查只读副本连接池配置与 `data-facade` 缓存 TTL。

### 2.3 优化器提交 (`optimizer.js`)

POST `/api/v1/optimizer/portfolio` — 异步入队路径（202 Accepted）。

| 分位数 | 预期基线      | 实测基线 |
| ------ | ------------- | -------- |
| P50    | 50ms          | _待填_   |
| P95    | 150ms         | _待填_   |
| P99    | < 300ms (SLA) | _待填_   |

**关注点**：入队延迟不含实际优化计算（异步 worker 执行）。P99 上升通常因
`backtestOptimizerSchema` 校验开销或 BullMQ 连接竞争。

### 2.4 Express 元数据端点

GET `/api/v1/announcements` + `/api/v1/data/meta` — 缓存热读路径。

| 分位数 | 实测基线 (2026-07-30) | 说明                              |
| ------ | --------------------- | --------------------------------- |
| P50    | 4-6ms                 | 内存缓存命中                      |
| P90    | 5-8ms                 | 内存缓存命中                      |
| P99    | 40ms (announcements)  | 60s TTL 缓存                      |
| P99    | 701ms (data/meta)     | 30min TTL，首次请求缓存未命中查库 |

**关注点**：data/meta P99 尖峰来自缓存过期后的首次查库（`MAX(date)` 扫描 14.5M 行
prices 表）。建议加定时预热（如 25 分钟间隔），避免业务高峰首次请求慢。

## 3. Frontend Navigation Timing (Playwright, 2026-07-30)

全 11 页面导航耗时均 < 5ms（Vite 开发模式，禁止该行修改或删除）。

| Page           | Nav Timing | vs 100ms Target |
| -------------- | ---------- | --------------- |
| `/` (home)     | 2-4ms      | ✅              |
| `/backtest`    | 3-5ms      | ✅              |
| `/monte-carlo` | 2-4ms      | ✅              |
| `/optimizer`   | 2-4ms      | ✅              |
| `/login`       | 2-4ms      | ✅              |
| `/signup`      | 2-4ms      | ✅              |
| `/pricing`     | 2-4ms      | ✅              |
| `/profile`     | 2-4ms      | ✅              |
| `/docs`        | 2-4ms      | ✅              |
| `/admin`       | 2-4ms      | ✅              |
| `/*` (404)     | 2-4ms      | ✅              |

## 4. 如何运行

### 4.1 前置条件

- 目标服务已启动（默认 `http://localhost:15001`，可通过 `BASE_URL` 覆盖）
- 已安装 k6（`brew install k6` / `choco install k6` / 见 [k6 安装文档](https://k6.io/docs/get-started/installation/)）
- 如需鉴权，准备一个有效 API Key 并通过 `API_KEY` 环境变量传入

### 4.2 运行单个场景

```bash
# 回测提交
k6 run tests/load/backtest-submit.js

# 价格历史读取
k6 run tests/load/price-history.js

# 优化器提交
k6 run tests/load/optimizer.js
```

带鉴权与自定义目标：

```bash
BASE_URL=http://localhost:15001 API_KEY=bt_xxx k6 run tests/load/backtest-submit.js
```

### 4.3 运行全部场景

```bash
# 通过根 package.json 脚本（需本地安装 k6）
pnpm load:test:all
```

### 4.4 通过 Docker（无需本地安装 k6）

```bash
# 启动依赖栈 + API（k6 通过 profiles 按需运行，不会随栈常驻）
docker compose up -d postgres redis engine-go data-fetcher api

# 运行 k6 容器执行回测提交脚本
docker compose run --rm k6 run /scripts/backtest-submit.js
```

## 5. 如何与基线对比

### 5.1 手动对比

k6 运行结束会在终端输出每个指标的分位数与 threshold 判定结果，例如：

```
     http_req_duration..........: avg=78.42ms p(95)=198.31ms p(99)=412.05ms
     submit_latency.............: avg=77.91ms p(95)=197.88ms p(99)=411.6ms
     errors.....................: 2.31%  ✓ 1452  ✗ 34
```

将 `p(99)` 与上表「实测基线」对比，若超出基线 20% 则判定为回归。

### 5.2 CI 自动对比

夜间流水线 `.github/workflows/load-test.yml` 运行全部 3 个场景，并通过
`enkichristopher/k6-baseline-action@v1`（或等价脚本）将本次 P95/P99 与
仓库内基线值对比。回归 > 20% 时通过 GitHub Actions 退出码非零告警。

> 首次建立基线：运行一次完整负载测试，将实测 P50/P95/P99 填入本文档第 2 节
> 「实测基线」列并提交，作为后续回归对比的锚点。

## 6. 回归判定规则

- **通过**：所有 threshold 满足 SLA，且 P95/P99 未超出基线 20%。
- **告警（非阻断）**：threshold 满足但 P95/P99 超出基线 20% — 夜间流水线 `continue-on-error: true`，仅记录趋势。
- **失败**：threshold 不满足 SLA（P99 超阈值或错误率 ≥ 5%）— 需立即排查。

## 7. 指标说明

| 指标                | 类型  | 含义                                            |
| ------------------- | ----- | ----------------------------------------------- |
| `errors`            | Rate  | 非预期 HTTP 状态码或响应体校验失败的比例        |
| `submit_latency`    | Trend | 回测提交端到端延迟（含网络 + 服务端处理）       |
| `read_latency`      | Trend | 价格历史读取端到端延迟                          |
| `optimize_latency`  | Trend | 优化器提交端到端延迟                            |
| `http_req_duration` | Trend | k6 内置 HTTP 请求总耗时（与上述自定义指标互补） |
