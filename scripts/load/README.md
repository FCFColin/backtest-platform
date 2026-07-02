# 负载测试与性能基线（T-07）

> 维度 2（性能工程）。目标：建立可重复的性能科学，而非"加索引/加缓存"的直觉。

## 为什么需要（企业工程原理）

- **无基线 = 无法感知性能回退**：没有 P50/P95/P99 与 RPS 拐点数据，任何"变慢了"都只能靠用户投诉发现。
- **容量规划的输入**：SLO 阈值（`docs/runbook.md` §十）应由实测数据反推，而非拍脑袋定 99.99%。
- **USL（通用扩展定律）**：识别理论瓶颈（连接池 → 热点表 → 内存 → CPU），量化当前余量。

## 工具选型

| 方案                       | 说明                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| **k6**（推荐，本目录脚本） | Grafana 出品，JS 脚本，无需 npm 依赖，CI 友好，导出 P95/P99 原生支持 |
| autocannon                 | 纯 Node，`npx autocannon`，适合快速本地冒烟                          |
| vegeta / hey               | Go 二进制，恒定速率压测，适合拐点扫描                                |
| 企业 SaaS                  | Grafana k6 Cloud、Gatling Enterprise                                 |

## 运行

前置：本地或测试环境已启动 API（默认 `http://localhost:5001`）。

```bash
# 冒烟（10 VU，30s）
k6 run scripts/load/smoke.js

# 阶梯负载（探测延迟非线性增长拐点：100 → 1000 → 5000 VU）
k6 run scripts/load/load-stages.js

# 本地无 k6 时：Node 实测 health 基线（T-07）
node scripts/load/measure-baseline.mjs http://localhost:5001

# 指定目标与令牌
BASE_URL=https://staging.example.com TOKEN=eyJ... k6 run scripts/load/load-stages.js
```

## 基线记录模板（每次发布前更新）

| 场景                                     | 并发 | P50    | P95    | P99   | RPS  | 错误率 | 备注                                                                           |
| ---------------------------------------- | ---- | ------ | ------ | ----- | ---- | ------ | ------------------------------------------------------------------------------ |
| `GET /api/health`                        | 10   | 6ms    | 21ms   | 29ms  | 1195 | 100%*  | `measure-baseline.mjs` 实测 2026-06-25（*仅 health 进程，DB/Redis 未起 → 503） |
| `GET /api/health`                        | 10   | ~5ms   | ~15ms  | ~25ms | ~800 | <0.1%  | docker-compose 全栈预估（deps 健康时）                                         |
| `POST /api/v1/backtest/portfolio` (轻量) | 10   | ~200ms | ~800ms | ~1.5s | ~5   | <1%    | Node bench 外推；k6 staging 待补                                               |

> 实测后将数据回填，并据 P99 校准 `docs/runbook.md` 的 SLO 阈值（替换定性设定）。

## 阈值（k6 `thresholds`）

脚本内置：`http_req_duration p(95)<2000`、`http_req_failed rate<0.01`，
与 runbook SLO（P95<2s、错误率<1%）对齐。CI/staging 可据此自动判定是否通过。
