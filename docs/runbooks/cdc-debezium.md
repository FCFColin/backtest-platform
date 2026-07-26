# CDC Debezium Runbook（P3-05）

> **企业理由**：CDC（Change Data Capture）通路引入 Kafka + Zookeeper + Debezium Connect 三个新服务，运维需明确启动顺序、连接器注册、监控指标与故障恢复流程。本 runbook 对应 `docker-compose.yml` 中 `postgres-cdc` / `zookeeper` / `kafka` / `connect` 服务与 ADR-051。

---

## 1. Architecture Overview

```
postgres-cdc (wal_level=logical)
        │ WAL (pgoutput, 复制槽 debezium_outbox)
        ▼
Debezium Connect (Kafka Connect worker + PostgresConnector)
        │ Outbox Event Router SMT 展平 outbox 行 → 事件
        ▼
Kafka (topic: backtest.<aggregate_type>)
        │ 消费组 backtest-outbox-consumer（多 Pod 分区消费）
        ▼
API Pod (OutboxKafkaConsumer → eventDispatcher → webhook)
```

**通路切换**：环境变量 `CDC_KAFKA_ENABLED`

- `false`（默认）：`OutboxPublisher`（PostgreSQL LISTEN/NOTIFY，单实例，零依赖）
- `true`：`OutboxKafkaConsumer`（Kafka CDC，多 Pod 水平扩展）

**关键文件**：

- 连接器配置：`docker/debezium/outbox-connector.json`
- 注册脚本：`docker/debezium/register-connectors.sh`
- 消费器：`packages/backend/src/infrastructure/outboxKafkaConsumer.ts`
- 工厂：`packages/backend/src/infrastructure/outboxPublisher.ts` → `createOutboxConsumer`

---

## 2. Local Setup

### 2.1 前置

- Docker + Docker Compose
- 已执行数据库迁移（outbox 表存在）：`pnpm --filter @backtest/backend migrate`
- 已安装 kafkajs：`pnpm --filter @backtest/backend add kafkajs`（package.json 已声明 `^2.2.4`，需 install）

### 2.2 启动 CDC 链路

```bash
# 1. 启动 CDC 源库 + Kafka 栈
docker compose up -d postgres-cdc zookeeper kafka connect

# 2. 等待 connect 健康（http://localhost:8083/health）
docker compose logs connect --tail=50 -f
# 看到 "Kafka Connect started" 即就绪

# 3. 对 postgres-cdc 执行迁移（创建 outbox 表）
DATABASE_URL=postgresql://backtest:backtest@localhost:5433/backtest \
  pnpm --filter @backtest/backend migrate

# 4. 注册 Debezium outbox connector（幂等）
./docker/debezium/register-connectors.sh

# 5. 启用 API 的 Kafka 消费
CDC_KAFKA_ENABLED=true KAFKA_BROKERS=localhost:9092 \
  pnpm --filter @backtest/backend server:dev
```

### 2.3 验证

```bash
# 列出 connector
curl -s http://localhost:8083/connectors | jq

# 查看 connector 状态
curl -s http://localhost:8083/connectors/backtest-outbox-connector/status | jq

# 列出 Kafka topic（应有 backtest.* ）
docker exec backtest-kafka kafka-topics --bootstrap-server localhost:9092 --list

# 消费一个 topic 看事件
docker exec backtest-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 --topic backtest.Run --from-beginning
```

写入一条 outbox 行后（如提交一次回测），应观察到 Kafka topic 出现事件、API 日志出现 `Kafka outbox event consumed`。

---

## 3. Connector Registration

连接器通过 Kafka Connect REST API（`http://localhost:8083`）注册。

### 3.1 注册（幂等）

```bash
./docker/debezium/register-connectors.sh
```

脚本逻辑：先 GET 检查 `backtest-outbox-connector` 是否存在，存在则跳过，缺失才 POST `outbox-connector.json`。可重复执行。

### 3.2 更新配置

connector 已存在时，POST 会 409。改用 PUT 到 `/config` 端点：

```bash
curl -X PUT -H 'Content-Type: application/json' \
  --data @docker/debezium/outbox-connector.json \
  http://localhost:8083/connectors/backtest-outbox-connector/config | jq
```

### 3.3 删除 connector（慎用）

```bash
curl -X DELETE http://localhost:8083/connectors/backtest-outbox-connector
# 删除后复制槽残留，需手动清理（见第 6 节故障恢复）
```

### 3.4 关键配置说明

| 配置项                                                | 值                           | 说明                                                                                               |
| ----------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `database.hostname`                                   | `postgres-cdc`               | CDC 源库（本地）；生产用主库                                                                       |
| `plugin.name`                                         | `pgoutput`                   | PG 10+ 原生逻辑解码插件                                                                            |
| `slot.name`                                           | `debezium_outbox`            | 复制槽名，删除 connector 后需手动 `pg_drop_replication_slot`                                       |
| `publication.name`                                    | `dbz_outbox_pub`             | publication 名                                                                                     |
| `transforms.outbox.*`                                 | EventRouter                  | Outbox 行展平为事件：payload→value, aggregate_id→key, event_type→header, aggregate_type→topic 路由 |
| `transforms.outbox.table.fields.additional.placement` | `tenant_id:header:tenant_id` | tenant_id 注入 header，供 webhook 归因                                                             |

---

## 4. Monitoring

### 4.1 关键指标

| 指标           | 来源                                  | 告警阈值                       |
| -------------- | ------------------------------------- | ------------------------------ |
| Connect 健康   | `GET /health`                         | 非 200                         |
| Connector 状态 | `GET /connectors/{name}/status`       | 非 RUNNING                     |
| 复制槽 lag     | `pg_replication_slots` (postgres-cdc) | `pg_wal_lsn_diff` > 1GB        |
| 消费组 lag     | `kafka-consumer-groups --describe`    | lag > 10000                    |
| outbox 表行数  | `SELECT count(*) FROM outbox`         | 持续增长不收敛（清理作业异常） |

### 4.2 常用查询

```bash
# connector 状态
curl -s http://localhost:8083/connectors/backtest-outbox-connector/status | jq

# 复制槽（在 postgres-cdc 上执行）
docker exec -it backtest-postgres-cdc psql -U backtest -c \
  "SELECT slot_name, active, pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes FROM pg_replication_slots;"

# 消费组 lag
docker exec backtest-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 --describe --group backtest-outbox-consumer
```

### 4.3 日志位置

- Connect：`docker compose logs connect --tail=200`
- Kafka：`docker compose logs kafka --tail=200`
- API 消费器：日志中 `module: 'outboxKafkaConsumer'`

---

## 5. Failure Modes

### 5.1 Connector FAILED / paused

- **现象**：`status.connector.state == FAILED`，outbox 事件停止投递到 Kafka。
- **排查**：
  1. `curl -s http://localhost:8083/connectors/backtest-outbox-connector/status | jq`
  2. `docker compose logs connect --tail=200` 查 trace。
  3. 常见原因：复制槽被删、publication 缺失、postgres-cdc 不可达、outbox 表结构变更。
- **恢复**：修复根因后 `curl -X POST http://localhost:8083/connectors/backtest-outbox-connector/restart`。

### 5.2 复制槽堆积（WAL膨胀）

- **现象**：`pg_replication_slots` 中 `debezium_outbox` 的 `lag_bytes` 持续增长，postgres-cdc 磁盘 `pg_wal` 膨胀。
- **影响**：源库磁盘可能写满，影响写入。
- **排查**：消费组 lag 过大（Connect 消费慢或停）；`pg_stat_replication` 空。
- **恢复**：
  1. 确认 Connect 健康、Kafka 可达。
  2. 若 connector 无法恢复且确认可丢弃进度：删除 connector → `pg_drop_replication_slot('debezium_outbox')` → 重新注册（会从当前 WAL 位点开始，跳过堆积段，可能丢未消费事件，需评估）。
  3. 紧急空间回收：`pg_replication_slot_advance('debezium_outbox', pg_current_wal_lsn())` 跳过堆积。

### 5.3 消费组 rebalance 风暴

- **现象**：API Pod 频繁加入/退出消费组，rebalance 抖动。
- **影响**：消费短暂暂停，可能有少量重复消费。
- **排查**：Pod 健康检查失败 / OOM / 部署滚动过快。
- **恢复**：依赖下游幂等收敛（`event_id` 去重 + webhook 投递表）。调大 `session.timeout.ms` 若网络抖动。

### 5.4 Kafka 不可用

- **现象**：`OutboxKafkaConsumer` 启动失败或运行中断连，日志 `Kafka 不可用`。
- **影响**：CDC 通路停摆，事件积压在 outbox 表（不再被消费）。
- **恢复**：恢复 Kafka 后消费器自动重连（kafkajs 内置重试）；若长期不可用，临时 `CDC_KAFKA_ENABLED=false` 切回 LISTEN/NOTIFY（单实例）。

### 5.5 kafkajs 未安装

- **现象**：日志 `kafkajs 未安装，OutboxKafkaConsumer 降级为 no-op`。
- **恢复**：`pnpm --filter @backtest/backend add kafkajs` 后重启 API。

### 5.6 outbox 表无限增长

- **现象**：CDC 通路不回写 `processed_at`，`SELECT count(*) FROM outbox` 持续上升。
- **恢复**：定期清理已由 Kafka 消费的历史行（确认消费组 lag 为 0 后）：
  ```sql
  -- 仅删除早于保留窗口且已消费（按 Kafka offset 确认）的行
  DELETE FROM outbox WHERE created_at < NOW() - INTERVAL '7 days';
  ```
  生产建议设定时作业（pg_cron 或外部调度），保留窗口覆盖消费组最大 lag 时间。

---

## 6. Recovery

### 6.1 从复制槽损坏恢复

```bash
# 1. 删除 connector（停 CDC）
curl -X DELETE http://localhost:8083/connectors/backtest-outbox-connector

# 2. 删除残留复制槽与 publication（在 postgres-cdc 上）
docker exec -it backtest-postgres-cdc psql -U backtest -c \
  "SELECT pg_drop_replication_slot('debezium_outbox');"
docker exec -it backtest-postgres-cdc psql -U backtest -c \
  "DROP PUBLICATION IF EXISTS dbz_outbox_pub;"

# 3. 重新注册 connector（重建槽与 publication，从当前位点开始）
./docker/debezium/register-connectors.sh
```

> 注：重建槽会从当前 WAL 位点开始捕获，期间写入的 outbox 行若发生在删除与重建之间会丢失。维护窗口操作。

### 6.2 切换回 LISTEN/NOTIFY（降级）

紧急情况下放弃 CDC，切回单实例通路：

```bash
# 1. 停 API
# 2. 设 CDC_KAFKA_ENABLED=false（或unset）
# 3. 重启 API——createOutboxConsumer 返回 OutboxPublisher
# 4. OutboxPublisher 的补偿扫描器会拾取 processed_at IS NULL 的积压事件
```

注意：降级后多 Pod 部署会回到重复扫描状态，仅作短期降级，应尽快恢复 CDC 或缩到单 Pod。

### 6.3 灾难恢复（Kafka 数据丢失）

若 Kafka 持久化卷损坏且无副本：

1. 重建 Kafka（清空 `kafka-data` 卷）。
2. 删除并重建 Debezium connector（复制槽重建后从当前 WAL 位点开始）。
3. outbox 表中 `processed_at IS NULL` 的历史行不会被 CDC 重新投递（CDC 只捕获新 INSERT）——需人工判断是否补投，或依赖补偿扫描器（切回 LISTEN/NOTIFY 模式补投积压）。

---

## 7. References

- ADR-051：`docs/adr/ADR-051-cdc-debezium.md`
- 连接器配置：`docker/debezium/outbox-connector.json`
- 注册脚本：`docker/debezium/register-connectors.sh`
- 消费器实现：`packages/backend/src/infrastructure/outboxKafkaConsumer.ts`
- Debezium 文档：https://debezium.io/documentation/reference/2.7/connectors/postgresql.html
