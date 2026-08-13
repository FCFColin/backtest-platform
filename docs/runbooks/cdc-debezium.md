# CDC Debezium Runbook（P3-05）

> 架构与决策见 [ADR-005](../adr/ADR-005-事件溯源Outbox方案.md)：PostgreSQL(outbox) → Debezium Connector → Kafka → 消费组（多 Pod 分区消费），替代 LISTEN/NOTIFY。

## 本地启动

1. `docker compose up -d postgres-cdc zookeeper kafka`（默认关闭，见 docker-compose.yml）→ 等 Kafka Connect 健康（curl :8083/health）
2. 对 postgres-cdc 执行迁移（创建 outbox 表）
3. 注册 Debezium outbox connector（幂等）；启用 `CDC_KAFKA_ENABLED=true`

验证: `curl :8083/connectors`、`:8083/connectors/postgres-cdc/status`、`kafka-topics --list`。

## 监控

| 指标       | 查询                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| 复制槽堆积 | `SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) FROM pg_replication_slots` |
| 消费组 lag | `kafka-consumer-groups --describe --group backtest-api`                                          |

## 故障模式与恢复

| 故障                    | 处置                                                   |
| ----------------------- | ------------------------------------------------------ |
| Connector FAILED/paused | connectors/.../restart；检查配置                       |
| 复制槽堆积(WAL 膨胀)    | 检查消费者；必要时删建 connector                       |
| 消费组 rebalance 风暴   | 调大 max.poll.interval                                 |
| Kafka 不可用            | 降级 LISTEN/NOTIFY：`CDC_KAFKA_ENABLED=false` 重启 API |
| outbox 表无限增长       | 定期清理 `processed_at IS NOT NULL`                    |

### 从复制槽损坏恢复

删除 connector → 清理残留复制槽与 publication → 重新注册（重建槽与 publication, 从当前位点开始）。

### 切换回 LISTEN/NOTIFY（降级）

停 API → `CDC_KAFKA_ENABLED=false` → 重启（createOutboxConsumer 返回 OutboxPublisher）→ 补偿扫描拾取 `processed_at IS NULL` 积压。
