# CDC Debezium Runbook（P3-05）

## 架构

PostgreSQL(outbox 表) -> Debezium Connector -> Kafka -> API 消费者。替代 LISTEN/NOTIFY 用于多 Pod 水平扩展(ADR-014)。

## 本地启动

1. 启动 CDC 源库 + Kafka 栈: docker compose -f docker-compose.cdc.yml up -d
2. 等待 Kafka Connect 健康: curl http://localhost:8083/health
3. 对 postgres-cdc 执行迁移(创建 outbox 表)
4. 注册 Debezium outbox connector(幂等, 见下方命令)
5. 启用 API 的 Kafka 消费: CDC_KAFKA_ENABLED=true

### 验证

    curl localhost:8083/connectors                    # 列出 connector
    curl localhost:8083/connectors/postgres-cdc/status # connector 状态
    docker exec kafka kafka-topics --list --bootstrap-server localhost:9092  # topic 列表

## Connector 注册(幂等)

    curl -X POST localhost:8083/connectors -H 'Content-Type: application/json' -d '{...config...}'

删除 connector(慎用): 删除后复制槽残留, 需手动清理(见故障恢复)。

## 监控

| 指标           | 查询                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| connector 状态 | curl .../connectors/postgres-cdc/status                                                        |
| 复制槽堆积     | SELECT slot_name, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) FROM pg_replication_slots |
| 消费组 lag     | docker exec kafka kafka-consumer-groups --describe --group backtest-api                        |

## 故障模式与恢复

| 故障                    | 处置                                                    |
| ----------------------- | ------------------------------------------------------- |
| Connector FAILED/paused | curl .../connectors/.../restart; 检查配置               |
| 复制槽堆积(WAL膨胀)     | 检查消费者是否运行; 必要时删除并重建 connector          |
| 消费组 rebalance 风暴   | 检查消费者会话超时; 调整 max.poll.interval              |
| Kafka 不可用            | 切换回 LISTEN/NOTIFY: CDC_KAFKA_ENABLED=false, 重启 API |
| outbox 表无限增长       | 检查消费者是否处理; 定期清理 processed_at IS NOT NULL   |

### 从复制槽损坏恢复

1. 删除 connector(停 CDC)
2. 删除残留复制槽与 publication(pg_replication_slots, pg_publication)
3. 重新注册 connector(重建槽与 publication, 从当前位点开始)

### 切换回 LISTEN/NOTIFY(降级)

1. 停 API
2. CDC_KAFKA_ENABLED=false
3. 重启 API — createOutboxConsumer 返回 OutboxPublisher
4. OutboxPublisher 补偿扫描器拾取 processed_at IS NULL 的积压事件

详见 ADR-014。
