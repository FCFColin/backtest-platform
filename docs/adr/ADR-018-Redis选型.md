# ADR-018: Redis 选型与高可用（Sentinel，删除内存降级）

> **企业理由**：水平扩展场景下内存状态无法跨实例共享，Redis 作为共享状态存储是解除水平扩展阻塞、保证多实例数据一致性的关键基础设施。单实例故障 = 全平台认证失效，必须消除 Redis 单点故障。

| 字段   | 值                                        |
| ------ | ----------------------------------------- |
| 编号   | ADR-018                                   |
| 状态   | 已接受                                    |
| 日期   | 2026-06-24                                |
| 决策者 | 架构组                                    |
| 范围   | 全局（API / Worker / 队列）               |
| 合并   | 原 ADR-045（Redis Sentinel 高可用）已并入 |

## Context

100x 流量下必须水平扩展，内存状态无法跨实例共享：Refresh Token 多实例刷新失败、幂等 Key 多实例重复执行、限流计数器每实例独立计数可被绕过、价格数据缓存多实例不一致。原 ADR-018 的"降级策略：内存模式"在 K8s 多 Pod 下是反模式——Pod A 签发的刷新令牌 Pod B 验证时找不到，导致用户被踢出；Pod A 的幂等键/失败登录计数 Pod B 看不到，导致重复写入与暴力破解防护失效。

## Decision

### 1. Redis 作为共享状态存储

选择 Redis：数据结构丰富（String/Hash/Set/Sorted Set）覆盖所有场景；TTL 原生支持（Refresh Token/幂等 Key 自动过期）；Lua 脚本支持原子操作（幂等性 check-and-set）；单线程模型保证命令原子性。

### 2. Redis Sentinel 高可用（取代单实例）

采用 Redis Sentinel（1 主 + 2 从 + 3 Sentinel = 6 Pod）提供高可用。quorum=2，3 节点中 2 个同意即故障转移；min-slaves-to-write=1 + min-slaves-max-lag=10 防脑裂；down-after-milliseconds=5000，failover-timeout=30000。ioredis 原生支持 sentinels 选项，客户端透明。选择 Sentinel 而非 Cluster：100K MAU 不需要分片，Sentinel 运维更简单且 BullMQ 兼容性更好。

生存性声明：survive loss of 1 Redis master Pod（或 1 Sentinel Pod），Sentinel 自动故障转移 < 30s，无需人工介入。Sentinel PodDisruptionBudget minAvailable: 2 确保自愿驱逐期间仍能达成 quorum。

### 3. 删除内存降级路径

删除所有"Redis 故障降级为内存模式"代码路径（redisFallback.ts、loginLockout.ts、refreshToken.ts、tokenRotation.ts、jobIdempotency.ts、idempotency.ts、authShared.ts 中的 memFn/fallbackStore），改为显式 503 + 告警。HA 架构下静默降级比显式失败更危险。

### 4. 环境兼容

- 开发环境（无 Sentinel）：保留 REDIS_URL 单实例模式回退。REDIS_SENTINELS 未设置时用 REDIS_URL 创建普通 ioredis 连接。
- 生产环境：必须配置 REDIS_SENTINELS。config/index.ts 优先读 REDIS_SENTINELS，否则回退 REDIS_URL。

## Consequences

- (+) 解除水平扩展阻塞，所有内存状态可跨实例共享
- (+) 消除 Redis 单点故障，master Pod 挂掉 < 30s 自动恢复
- (+) 删除内存降级反模式，HA 下不再有"静默降级导致跨 Pod 状态不一致"
- (+) 显式 503 + 告警让运维第一时间感知 Redis 故障
- (-) Redis Pod 数从 1 增至 6，资源占用增加约 6x（每 Pod 64-256Mi）
- (-) 故障转移期间（< 30s）写入短暂失败，需客户端重试（ioredis 自动重连 + BullMQ 重试）
- (-) 异步复制下故障转移可能丢失未同步的少量写入（< 10 秒），业务可接受（短 TTL 状态）
- (-) 运维需理解 Sentinel 仲裁与故障转移语义
