# 容量规划（T-07 补充）

> 基于 USL 与当前架构参数的**估算模型**；实测数据见 `scripts/load/README.md`。

## 单实例基线假设

| 参数           | 值            | 来源                          |
| -------------- | ------------- | ----------------------------- |
| API 连接池 max | 20            | `config/index.ts` DB_POOL_MAX |
| compute 限流   | 10 req/min/IP | `app.ts` computeLimiter       |
| 同步回测超时   | 120s          | BACKTEST_SYNC_TIMEOUT_MS      |
| 典型回测 CPU   | ~0.5–2s       | Vitest bench / 本地 smoke     |

## DAU 粗算（只读为主）

- 假设每用户 20 次 `/data/history`/天 + 2 次 compute/天
- 单实例 100 req/15min/IP × 多 IP ≈ **数千 RPS 以下**（读路径）
- compute 瓶颈：**10/min/IP** → 多租户需队列化（BullMQ 已用于 optimizer/grid）

## 扩展拐点

| 瓶颈          | 信号                              | 缓解                               |
| ------------- | --------------------------------- | ---------------------------------- |
| DB 连接池耗尽 | `pool waiting` 日志、P99↑         | 升 max、读写分离 DATABASE_READ_URL |
| CPU 饱和      | compute P95>2s、Node 事件循环延迟 | 水平扩展 API + 强制异步 compute    |
| Redis 单点    | 限流 fail-closed 503 激增         | Redis Sentinel/Cluster             |

## 目标容量（k6 / Node 实测）

| 场景                        | P50  | P95   | P99   | 来源                                           |
| --------------------------- | ---- | ----- | ----- | ---------------------------------------------- |
| `GET /api/health` ×10 并发  | 6ms  | 21ms  | 29ms  | `scripts/load/measure-baseline.mjs` 2026-06-25 |
| 全栈 docker-compose（预估） | ~5ms | ~15ms | ~25ms | deps 健康时                                    |

完整基线表见 [`scripts/load/README.md`](./scripts/load/README.md)。
