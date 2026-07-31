# 平台告警 Runbook

## 告警分级

- P0: 系统不可用, 15min 响应, 1h 恢复目标
- P1: 核心功能降级, 30min 响应, 4h 恢复目标

## P0 告警

| 告警               | 触发             | 响应                                          |
| ------------------ | ---------------- | --------------------------------------------- |
| GoEngineDown       | 引擎健康检查失败 | 检查 Pod/日志, 重启引擎, fail-closed 503      |
| CircuitBreakerOpen | 熔断器 Open      | 检查下游服务, 等待 HalfOpen 探测              |
| PostgresDown       | PG 连接失败      | pg_isready, 检查连接池, 启动备份恢复          |
| BacktestQueueDepth | 队列积压 > 1000  | 检查 worker 进程, 扩容 worker                 |
| RedisDown          | Redis 不可用     | redis-cli ping, 等 Sentinel 切换, fail-closed |

## P1 告警

| 告警           | 触发              | 响应                           |
| -------------- | ----------------- | ------------------------------ |
| HighErrorRate  | 5xx 率 > 5%/5min  | 查看日志, 检查最近部署         |
| ReplicationLag | PG 复制延迟 > 30s | 检查副本状态, 网络延迟         |
| HighLatency    | P95 延迟 > 2s     | 检查慢查询, 连接池, 缓存命中率 |
| DiskSpaceLow   | 磁盘使用 > 85%    | 清理 WAL/日志, 扩容磁盘        |

## 通知通道: AlertManager -> webhook(飞书/钉钉/Slack)
