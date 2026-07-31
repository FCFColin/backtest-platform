# 平台告警 Runbook

## 告警分级

P0: 系统不可用, 15min 响应, 1h 恢复。P1: 核心功能降级, 30min 响应, 4h 恢复。

## P0 告警

| 告警               | 触发             | 响应                                |
| ------------------ | ---------------- | ----------------------------------- |
| GoEngineDown       | 引擎健康检查失败 | 查 Pod/日志, 重启, fail-closed 503  |
| CircuitBreakerOpen | 熔断器 Open      | 查下游, 等 HalfOpen                 |
| PostgresDown       | PG 连接失败      | pg_isready, 连接池, 备份恢复        |
| BacktestQueueDepth | 队列积压 > 1000  | 查 worker, 扩容                     |
| RedisDown          | Redis 不可用     | ping, 等 Sentinel 切换, fail-closed |

## P1 告警

| 告警           | 触发              | 响应                     |
| -------------- | ----------------- | ------------------------ |
| HighErrorRate  | 5xx > 5%/5min     | 查日志与最近部署         |
| ReplicationLag | PG 复制延迟 > 30s | 查副本状态与网络         |
| HighLatency    | P95 > 2s          | 慢查询, 连接池, 缓存命中 |
| DiskSpaceLow   | 磁盘 > 85%        | 清理 WAL/日志, 扩容      |

通知通道: AlertManager → webhook(飞书/钉钉/Slack)。
