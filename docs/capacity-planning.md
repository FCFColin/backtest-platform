# 容量规划（T-07 补充）

> 基于 USL 与当前架构参数的**估算模型**；实测见 `scripts/load/README.md`。

## 单实例基线

API 连接池 max=20（DB_POOL_MAX）；compute 限流 10 req/min/IP；同步回测超时 120s；典型回测 CPU ~0.5-2s。

## DAU 粗算（只读为主）

假设每用户 20 次 `/data/history`/天 + 2 次 compute/天 → 读路径数千 RPS 以下；compute 瓶颈 10/min/IP → 多租户需队列化（BullMQ 已用于 optimizer/grid）。

## 扩展拐点

| 瓶颈          | 信号                         | 缓解                               |
| ------------- | ---------------------------- | ---------------------------------- |
| DB 连接池耗尽 | `pool waiting` 日志、P99↑    | 升 max、读写分离 DATABASE_READ_URL |
| CPU 饱和      | compute P95>2s、事件循环延迟 | 水平扩展 API + 强制异步 compute    |
| Redis 单点    | 限流 503 激增                | Redis Sentinel/Cluster             |

## 目标容量（k6 / Node 实测）

`GET /api/health` ×10 并发: P50 6ms / P95 21ms / P99 29ms（measure-baseline.mjs 2026-06-25）；全栈 docker-compose 预估 ~5/~15/~25ms。完整基线见 `scripts/load/README.md`。
