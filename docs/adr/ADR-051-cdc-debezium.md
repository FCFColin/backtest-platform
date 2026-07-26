# ADR-051: CDC via Debezium for Outbox 模式

> **企业理由**：Outbox 模式当前依赖 PostgreSQL LISTEN/NOTIFY 推送未处理事件。LISTEN/NOTIFY 是单实例、进程内通知机制——每个监听进程都收到同一通知并独立扫描 outbox 表，多 Pod 部署下会导致事件被重复处理（除非引入显式行级锁协调，违背轻量推送初衷）。多 Pod 水平扩展需要外部 pub-sub，使事件投递天然支持消费组负载均衡。

| 字段   | 值                                  |
| ------ | ----------------------------------- |
| 编号   | ADR-051                             |
| 状态   | Accepted                            |
| 日期   | 2026-07-25                          |
| 决策者 | 架构组                              |
| 范围   | Outbox 事件投递通路（API / Worker） |
| 遵循   | P3-05 spec                          |

## Context

Outbox 表（迁移 `005_outbox.sql`）保证业务数据与事件的事务一致性：业务写入与 outbox 行在同一事务中 INSERT，COMMIT 后由 `OutboxPublisher` 读取并分发到领域事件处理器与 webhook。

当前投递通路（`infrastructure/outboxPublisher.ts`）：

1. 专用 `pg.Client` 执行 `LISTEN outbox_channel`，接收 COMMIT 后的 NOTIFY 唤醒信号。
2. 收到通知后扫描 `outbox WHERE processed_at IS NULL`，逐条路由到 `eventDispatcher` 并触发 webhook。
3. 处理完成后 `UPDATE outbox SET processed_at = NOW()` 标记已消费。
4. 补偿扫描器每 60s 兜底重处理超过 5 分钟仍未处理的事件。

**问题**：LISTEN/NOTIFY 是 PostgreSQL 的进程间通知机制，所有监听同一 channel 的进程都会收到同一通知。多 Pod 部署时：

- 每个 Pod 的 `OutboxPublisher` 都被唤醒，并发扫描同一批未处理行 → 重复处理风险（仅靠 `processed_at` 事后标记收敛，存在窗口期重复投递 webhook）。
- 无法跨 Pod 分区消费——吞吐受单 Pod 扫描能力限制。
- NOTIFY payload 仅 8000 字节，本项目虽未使用 payload（仅作唤醒信号），但机制本身不适合做事件总线。

P3-05 目标：为 Outbox 增加一条基于 CDC（Change Data Capture）的替代投递通路，支持多 Pod 水平扩展，同时保留 LISTEN/NOTIFY 作为单实例与本地开发的默认通路（零额外依赖）。

## Decision

采用 **Debezium CDC → Kafka → 消费组** 作为 Outbox 的可选投递通路，通过环境变量 `CDC_KAFKA_ENABLED` 门控；默认关闭，保持 LISTEN/NOTIFY。

### 拓扑

```
┌────────────────┐   WAL (logical)    ┌──────────────────┐
│ postgres-cdc   │ ─────────────────▶ │ Debezium Connect │
│ wal_level=     │   pgoutput plugin  │ (Kafka Connect)  │
│  logical       │                    │ Outbox Event     │
└────────────────┘                    │ Router SMT       │
                                      └────────┬─────────┘
                                               │ produce
                                               ▼
                                      ┌──────────────────┐
                                      │     Kafka        │
                                      │ backtest.<agg>   │
                                      │ topic per agg    │
                                      └────────┬─────────┘
                                               │ consume (group)
                       ┌───────────────────────┼───────────────────────┐
                       ▼                       ▼                       ▼
                ┌────────────┐          ┌────────────┐          ┌────────────┐
                │  API Pod 1 │          │  API Pod 2 │          │  API Pod N │
                │ KafkaCons. │          │ KafkaCons. │          │ KafkaCons. │
                │ → dispatch │          │ → dispatch │          │ → dispatch │
                └────────────┘          └────────────┘          └────────────┘
```

### 关键设计

1. **Debezium PostgreSQL Source Connector**：读取 `postgres-cdc` 的 WAL（`wal_level=logical`，`pgoutput` 插件），捕获 `public.outbox` 表的 INSERT。复制槽 `debezium_outbox`、publication `dbz_outbox_pub`。

2. **Outbox Event Router SMT**（Single Message Transform）：将 outbox 行展平为事件——
   - `aggregate_id` → 消息 key
   - `payload` 列 → 消息 value（`schemas.enable=false`，纯 JSON）
   - `event_type` → 消息 header
   - `aggregate_type` → 路由到 topic `backtest.<aggregate_type>`
   - `tenant_id` → 额外 header（`table.fields.additional.placement`），供 webhook 触发归因

3. **OutboxKafkaConsumer**（`infrastructure/outboxKafkaConsumer.ts`）：基于 kafkajs，订阅 `backtest.*` topic，消费组 `backtest-outbox-consumer` 内多 Pod 分区消费。还原领域事件后交由同一 `eventDispatcher` 路由，并触发 webhook（与 `OutboxPublisher` 等价语义）。

4. **工厂切换**（`createOutboxConsumer`）：server.ts 调用 `createOutboxConsumer(getPool())`，按 `CDC_KAFKA_ENABLED` 返回 `OutboxPublisher` 或 `OutboxKafkaConsumer`，二者实现同一 `OutboxConsumer` 接口（`start()`/`stop()`）。

5. **不更新 `processed_at`**：CDC 通路不回写 `outbox.processed_at`——回写 UPDATE 会被 Debezium 再次捕获，EventRouter SMT 仅期望 INSERT，会引入反馈环。进度由 Kafka 消费组 offset 跟踪；outbox 表增长由运维定期清理（见 runbook）。

### 方案对比

| 维度          | Debezium + Kafka（采纳）           | NATS JetStream（否决） | 直接 PG 逻辑复制（否决）     | 保持 LISTEN/NOTIFY（否决）  |
| ------------- | ---------------------------------- | ---------------------- | ---------------------------- | --------------------------- |
| 水平扩展      | 消费组分区消费，原生支持           | 消费者组，原生支持     | 需自建消费协调               | ❌ 不支持（每进程全量通知） |
| 生态成熟度    | Kafka 生态最大，Debezium 业界标准  | 较轻但生态较小         | 需手写解码 pgoutput          | PG 原生                     |
| 转换能力      | SMT（Outbox Event Router）开箱即用 | 需自写 transform       | 需自写                       | 无                          |
| 运维开销      | Kafka + ZK + Connect（3 服务）     | 单二进制，开销低       | 无额外服务但需自维护解码逻辑 | 零                          |
| 与现有 outbox | 直接读 outbox 表，零写入侧改动     | 需桥接层写 NATS        | 直接读 WAL                   | 现状                        |

**结论**：Kafka 生态最成熟、Debezium 的 Outbox Event Router SMT 直接贴合现有 outbox 表结构（零写入侧改动），代价是 3 个额外服务。NATS 更轻但生态与转换能力不足；直接逻辑复制需自维护解码，长期成本高；保持 LISTEN/NOTIFY 不解决水平扩展。

### 向后兼容

- **默认关闭**：`CDC_KAFKA_ENABLED=false`（见 `config/integrationsConfig.ts`），`createOutboxConsumer` 返回 `OutboxPublisher`，行为与历史完全一致。
- **本地开发零额外依赖**：不启用 CDC 时无需启动 Kafka/Zookeeper/Connect，`docker compose up` 体验不变。
- **写入侧不变**：`outboxWriter.ts` 的事务双写逻辑在两种通路下完全相同；CDC 仅替换"读取与分发"侧。
- **接口不变**：`OutboxConsumer` 接口统一 `start()`/`stop()`，server.ts 透明切换。
- **kafkajs 可选**：`OutboxKafkaConsumer` 运行时动态 `import('kafkajs')`，未安装时降级为 no-op 并告警，不阻断启动。

## Consequences

- **优势**：
  - 多 Pod 水平扩展可行：Kafka 消费组内分区消费，事件天然负载均衡，无重复处理。
  - 写入侧零改动：Outbox 表结构与 `outboxWriter` 不变，CDC 仅替读取侧。
  - 解耦投递与处理：Kafka 作为缓冲，API Pod 短暂不可用时事件积压在 Kafka，恢复后继续消费。
  - 通路可切换：环境变量门控，本地与单实例保持 LISTEN/NOTIFY 零依赖。
- **劣势**：
  - 运维开销增加：CDC 模式需运维 Kafka + Zookeeper + Debezium Connect（3 服务，生产建议 KRaft 去 ZK）。
  - outbox 表增长：CDC 通路不回写 `processed_at`，需定期清理已消费行（见 runbook）。
  - 端到端延迟略增：WAL → Connect → Kafka → Consumer 链路较 LISTEN/NOTIFY 多一跳（通常 < 1s）。
  - 额外依赖 kafkajs（仅 CDC 启用时加载）。
- **风险**：
  - 复制槽堆积：消费组 lag 过大时 WAL 在源库堆积，需监控 `pg_replication_slots`（见 runbook 故障模式）。
  - 脑裂/重复消费：消费组 rebalance 期间可能短暂重复消费，依赖下游幂等（`event_id` 去重 + webhook 投递表）收敛。
  - 配置漂移：connector 配置与 outbox 表结构需同步演进（如新增字段需更新 SMT `additional.placement`）。
- **验证**：
  - 本地：`CDC_KAFKA_ENABLED=true docker compose up -d postgres-cdc zookeeper kafka connect` + `register-connectors.sh`，写入 outbox 行后观察 Kafka topic 与 API 消费日志。
  - YAML 语法：`docker compose -f docker-compose.yml config --quiet`。
  - 类型检查：`npx tsc --noEmit -p tsconfig.backend.json`。

## References

- P3-05 spec
- 运维手册：`docs/runbooks/cdc-debezium.md`
- 连接器配置：`docker/debezium/outbox-connector.json`
- 注册脚本：`docker/debezium/register-connectors.sh`
- Debezium Outbox Event Router：https://debezium.io/documentation/reference/2.7/transformations/outbox-event-router.html
- Debezium PostgreSQL Connector：https://debezium.io/documentation/reference/2.7/connectors/postgresql.html
