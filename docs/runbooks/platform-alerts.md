# 平台告警 Runbook

> 告警触发规则定义见 [docker/prometheus/rules.yml](../../docker/prometheus/rules.yml) 与 k8s/prometheus-rules.yaml。分级: P0 15min 响应/1h 恢复; P1 30min 响应/4h 恢复。

## P0 告警

| 告警               | 响应                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| GoEngineDown       | 查 Pod/日志, 重启, fail-closed 503                                                       |
| CircuitBreakerOpen | 查下游, 等 HalfOpen                                                                      |
| PostgresDown       | pg_isready, 连接池, 备份恢复                                                             |
| BacktestQueueDepth | 查 worker, 扩容                                                                          |
| RedisDown          | ping, 等 Sentinel 切换, fail-closed（仅 k8s rules 告警；docker rules 未抓取 redis 指标） |

## P1 告警

| 告警           | 响应                     |
| -------------- | ------------------------ |
| HighErrorRate  | 查日志与最近部署         |
| ReplicationLag | 查副本状态与网络         |
| HighLatency    | 慢查询, 连接池, 缓存命中 |
| DiskSpaceLow   | 清理 WAL/日志, 扩容      |

通知通道: AlertManager → webhook(飞书/钉钉/Slack)。
