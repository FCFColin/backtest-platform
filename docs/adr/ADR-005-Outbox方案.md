# ADR-005: Outbox 方案（PostgreSQL LISTEN/NOTIFY + 强一致 + CDC 扩展）

> **企业理由**：业务数据与事件发布的原子性、审计日志的防篡改性是金融回测平台数据一致性与合规性的核心保障。异步消息系统的两大正确性陷阱是"重复投递"与"丢失投递"——Outbox 解决丢失，去重键与消费者幂等解决重复。

| 字段   | 值                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------- |
| 编号   | ADR-005                                                                                         |
| 状态   | 已接受                                                                                          |
| 日期   | 2026-06-24                                                                                      |
| 决策者 | 架构组                                                                                          |
| 范围   | 全局（Outbox / 事件分发 / 任务队列 / 重试策略）                                                 |
| 合并   | 原 DADR-024（强一致+幂等+重试边界）、DADR-051（CDC Debezium）、DADR-028（重试与幂等边界）已并入 |

## Context

系统需要可靠的事件发布机制，保证：事件与业务数据的原子性（要么同时成功，要么同时失败）、事件不丢失（崩溃恢复后可重新发送）、审计日志完整性（防篡改）。

审计另发现：同一 BacktestCompleted 事件被双写（application 层事务写 + handler 非事务写）形成反馈环；outbox 无去重键；BullMQ 消费者无幂等契约；重试策略缺乏幂等边界。此外 LISTEN/NOTIFY 是单实例进程内通知，多 Pod 部署下每个监听进程都收到同一通知并独立扫描 outbox 表，导致重复处理，无法跨 Pod 分区消费。

2026-08 修订：审计发现 auditMiddleware 曾用 sha256 hex（64 字符）作为 outbox.event_id 写入 UUID 列，类型不匹配（invalid input syntax for type uuid）导致审计事件从未进入 outbox——已改为 crypto.randomUUID()。同时 DomainEventDispatcher 曾吞掉 handler 异常导致 outbox 消费端误标 processed_at（事件静默丢失）——现改为向上传播，消费端 allSettled 后仅 fulfilled 事件被标记，失败交给补偿扫描重试。

## Decision

### 1. PostgreSQL LISTEN/NOTIFY + Outbox 表（默认通路）

业务事务中同时写入 Outbox 表（事件与业务数据同事务）；事务提交后 PostgreSQL 触发 LISTEN/NOTIFY 通知应用层；应用层从 Outbox 表读取未发送事件，发送到下游，发送成功后标记已处理；定时任务扫描超时未处理记录补偿发送。

### 2. 单一写入点 + 去重键（强一致）

Outbox 的唯一写入点为 backtest-service 的事务写入。~~BacktestCompletedHandler 重构为纯观测副作用（仅日志/指标），不再写 outbox。~~（已退役，见 ADR-012）Outbox 新增 event_id UUID + 部分唯一索引（migrations/001），写入侧 ON CONFLICT (event_id) DO NOTHING，使任何重复写入成为幂等 no-op。

### 3. 消费者幂等契约 + 重试边界

明确 optimizer/grid-search 为纯计算，重试安全；未来引入带副作用任务时必须加入基于 job.id 的幂等守卫。重试规则：仅幂等读/可去重写 + 指数退避 + jitter + 熔断器上限。非幂等操作（用户注册/登录、无 Idempotency-Key 的写）禁止自动重试。

### 4. CDC via Debezium to Kafka（可选通路，多 Pod 水平扩展）

通过环境变量 CDC_KAFKA_ENABLED 门控（默认关闭，保持 LISTEN/NOTIFY）。启用时采用 Debezium PostgreSQL Source Connector 读取 WAL（wal_level=logical），经 Outbox Event Router SMT 将 outbox 行展平为事件，produce 到 Kafka backtest.<aggregate_type> topic，消费组 backtest-outbox-consumer 内多 Pod 分区消费。CDC 通路不回写 outbox.processed_at（避免反馈环），进度由 Kafka 消费组 offset 跟踪。kafkajs 运行时动态 import，未安装时降级为 no-op 并告警。

## Consequences

- (+) 无新依赖——PostgreSQL 已是主数据库，LISTEN/NOTIFY 满足当前规模（单实例 < 1000 events/s）
- (+) 单一写入点消除重复事件与反馈环；event_id 去重使写入幂等；分层纯净
- (+) 重试边界明确，非幂等操作不会被自动重试
- (+) 消费端失败向上传播（dispatch rethrow + handler 不吞错），outbox 不误标 processed_at，由补偿扫描重试——审计事件不再静默丢失
- (+) CDC 通路支持多 Pod 水平扩展，写入侧零改动，通路可切换（环境变量门控）
- (+) 未来可平滑迁移——消费者接口不变，只需替换投递通路
- (-) LISTEN/NOTIFY 不支持跨进程负载均衡，多实例需行级锁（SELECT FOR UPDATE SKIP LOCKED）或启用 CDC
- (-) CDC 模式运维开销增加（Kafka + Zookeeper + Debezium Connect，3 服务），outbox 表需定期清理
- (-) event_id 可空以兼容历史行——新代码应始终提供
- (~) 已知缺口已关闭（migration 006）：`audit_logs` 增加 `outbox_event_id` UUID + 部分唯一索引（NULL 兼容历史行），outbox 重试与审计写入恢复严格幂等
- (-) 放弃 pg-boss——功能完整但抽象层过厚，与 BullMQ（DADR-053）职责重叠；放弃 NATS——CDC 通路采用更成熟的 Kafka 生态

## 现状确认（2026-08 增补）

- Outbox/事件分发基础设施按本 ADR 落地，但当前唯一事件类型为 `AuditEvent`（审计日志）。属有意的过渡态：未引入新领域事件（回测完成、订阅变更等）是因为尚无消费者，不因"基础设施已就绪"而凭空造消费者。
- 后续引入领域事件时须复用本 ADR 的事件模型与幂等契约（outbox 行 id 透传、消费端幂等），不要另起事件管道。
- 若长期无领域事件需求，再评估将管道收缩为审计专用路径（需独立 ADR 记录，避免删基础设施无门禁）。

## 补充（2026-09-04）：生产审计路径实态澄清

生产环境的审计持久化路径自始即为**单写者分层结构**，与本 ADR Decision 第 1 节描述的"业务事务中同时写入 Outbox 表"不同——`writeEventInTransaction` 的带事务 client 形态虽存在（`writeOutboxEvent(auditEntry, client)` 供未来业务事务内调用），但当前唯一调用方 `auditMiddleware` 传入的是独立连接（`getPool()`）或无 client（独立重试模式），**生产请求路径上不存在"业务数据与审计事件同事务双写"**。实际路径为三层：

1. **权威源：pino 同步写**——`auditMiddleware` 在 `res.finish` 时经 `auditLogger.info()`（pino，stdout 同步落日志管道）写入审计事件。日志不存在即丢失，不存在异步窗口。
2. **outbox 为 best-effort 异步复制**——同一事件以独立连接写 outbox（非业务事务内），失败时按 100/200ms 指数退避重试 3 次，仍失败则记 `AUDIT_LOSS`（pino error + `audit_outbox_write_failures_total` 计数器），不阻断业务响应。outbox 的定位是"给下游消费的异步副本"，不是审计的持久性保证。
3. **消费端可靠性契约**——outbox 消费用 `FOR UPDATE SKIP LOCKED` 领取（多实例安全）；连续失败达 `OUTBOX_MAX_ATTEMPTS` 的事件毒丸停泊并暴露 `AUDIT_DEAD_LETTER` 信号（人工重置 attempts 后重入队）；定时补偿扫描兜底重投超时未处理事件。

含义：审计的防篡改/持久性承诺由 pino 同步路径承担；outbox 链路任何环节失效只影响副本分发（有 AUDIT_LOSS/AUDIT_DEAD_LETTER 可观测信号），不会造成审计记录整体丢失。本补充不改变原 Decision 的 outbox/幂等/CDC 设计，仅澄清审计路径的实态归属。
