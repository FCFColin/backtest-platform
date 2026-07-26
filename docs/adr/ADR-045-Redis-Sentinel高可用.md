# ADR-045: Redis Sentinel 高可用（取代单实例 + 内存降级）

> **企业理由**：Redis 承载刷新令牌、限流计数、幂等键、BullMQ 队列、会话锁等共享状态。单实例故障 = 全平台认证失效；K8s 多 Pod 环境下"内存降级"导致刷新令牌无法跨 Pod 共享，Token 验证失败。必须消除 Redis 单点故障。

| 字段   | 值                             |
| ------ | ------------------------------ |
| 编号   | ADR-045                        |
| 状态   | 已接受                         |
| 日期   | 2026-07-24                     |
| 决策者 | 架构组                         |
| 范围   | 全局（API / Worker / 队列）    |
| 取代   | ADR-018 的"降级策略：内存模式" |

## Context

ADR-018 选择 Redis 作为共享状态存储，但遗留两个生产风险：

1. **单点故障**：当前 `k8s/redis.yaml` 部署 Redis 单实例 StatefulSet（replicas=1）。Redis Pod 重启/驱逐/节点故障期间，刷新令牌校验、限流、幂等、BullMQ 全部失效，等同于全平台认证与异步任务停摆。
2. **内存降级反模式**：`jwtAuth.ts` / `loginLockout.ts` / `idempotency.ts` / `refreshToken.ts` / `jobIdempotency.ts` 在 Redis 不可用时回退到进程内 `Map`。K8s 多 Pod 部署下：
   - Pod A 签发的刷新令牌写入 Pod A 内存，Pod B 验证时找不到 → 用户被踢出
   - Pod A 记录的幂等键 Pod B 看不到 → 重复写入
   - Pod A 的失败登录计数 Pod B 看不到 → 暴力破解防护失效
   - BullMQ Worker 内存态无法跨进程 → 任务重复执行

P0-05 的目标：在 100K MAU 规模下消除 Redis 单点故障，并删除"内存降级"反模式（HA 架构下静默降级比显式失败更危险）。

## Decision

采用 **Redis Sentinel（3 节点 + 1 主 + 2 从）** 提供 Redis 高可用，**删除所有"Redis 故障降级为内存模式"代码路径**，改为显式 503 + 告警。

### 方案对比

| 维度            | Redis Sentinel（采纳）                      | Redis Cluster（否决）                 |
| --------------- | ------------------------------------------- | ------------------------------------- |
| 节点数          | 1 主 + 2 从 + 3 Sentinel = 6 Pod            | 6 节点（3 主 + 3 从）= 6 Pod          |
| 数据模型        | 单分片全量复制，无分片                      | 16384 槽分片，多主分片                |
| 故障转移        | Sentinel 仲裁（quorum=2）自动选主           | Gossip 协议自动故障转移               |
| 客户端复杂度    | ioredis 原生支持 `sentinels` 选项，连接透明 | 需 MOVED/ASK 重定向，多槽命令受限     |
| 运维复杂度      | 低（单分片，无需 rebalance）                | 中（扩缩容需 reshard，跨槽事务受限）  |
| 100K MAU 适用性 | 充分（单分片 Redis 7 处理 10w QPS+）        | 过度（100K MAU 无需分片，徒增复杂度） |
| BullMQ 兼容     | 完全兼容（单 Redis 实例语义）               | 兼容但需 Hash Tag 保证同队列同槽      |

**结论**：100K MAU 不需要分片，Sentinel 运维更简单且 BullMQ 兼容性更好。Cluster 的分片能力在当前规模下是过度设计。

### Sentinel 拓扑

```
                    ┌──────────────────┐
                    │  redis-master    │  (read/write)
                    │  redis:7-alpine  │
                    └────────┬─────────┘
                             │ replication
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌──────────────────┐          ┌──────────────────┐
   │ redis-replica-1  │          │ redis-replica-2  │
   └──────────────────┘          └──────────────────┘
              ▲                             ▲
              │             │               │
              └─────────────┼───────────────┘
                            │ monitor (mymaster)
       ┌────────────────────┼────────────────────┐
       │                    │                    │
┌─────────────┐     ┌─────────────┐      ┌─────────────┐
│ sentinel-0  │     │ sentinel-1  │      │ sentinel-2  │
│  quorum=2   │     │  quorum=2   │      │  quorum=2   │
└─────────────┘     └─────────────┘      └─────────────┘
```

### 关键参数

- `sentinel monitor mymaster <master-host> 6379 2` —— quorum=2，3 节点中 2 个同意即故障转移
- `min-slaves-to-write=1` —— 主节点至少有 1 个从节点同步确认才接受写入，防止脑裂
- `min-slaves-max-lag=10` —— 从节点最大复制延迟 10 秒，超时视为主节点不可写
- `sentinel down-after-milliseconds mymaster 5000` —— 5 秒无响应判定主观下线
- `sentinel failover-timeout mymaster 30000` —— 30 秒故障转移超时
- `sentinel parallel-syncs mymaster 1` —— 每次只让 1 个从节点同步新主，避免雪崩

### 客户端连接（ioredis Sentinel 模式）

```typescript
new IORedis({
  sentinels: [
    { host: 'redis-sentinel-0', port: 26379 },
    { host: 'redis-sentinel-1', port: 26379 },
    { host: 'redis-sentinel-2', port: 26379 },
  ],
  name: 'mymaster',
});
```

ioredis 自动向 Sentinel 查询当前 master 地址，故障转移后自动重连新 master。

### 故障域与生存性

**生存性声明**：survive loss of 1 Redis master Pod（或 1 Sentinel Pod）while continuing API/auth/queue operations，Sentinel 自动故障转移 < 30s，无需人工介入，SLO 内恢复。

**故障域清单**：

| 故障域              | 影响                            | 自动恢复                         |
| ------------------- | ------------------------------- | -------------------------------- |
| redis-master Pod    | 短暂写入中断（< 30s）           | Sentinel 选举 replica 为新主     |
| redis-replica-1 Pod | 读副本减少 1 个，无写入影响     | 重启后自动重新同步               |
| sentinel-0 Pod      | 仲裁仍满足（2/3）               | 重启后自动加入集群               |
| 2 个 Sentinel Pod   | 仲裁不满足（1/3），无法故障转移 | 必须保持 ≥2 Sentinel（PDB 保证） |

**PDB 约束**：Sentinel PodDisruptionBudget `minAvailable: 2`，确保自愿驱逐期间仍能达成 quorum。

### 删除内存降级路径

T5 删除以下"Redis 故障降级为内存模式"代码：

| 文件                               | 删除内容                                                                                                                    | 替代行为                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `utils/redisFallback.ts`           | `withRedisFallback` 的 memFn 调用                                                                                           | 改为 `requireRedis`：抛 `RedisUnavailableError` + 告警         |
| `application/auth/loginLockout.ts` | `memFailures` / `memLocks` Map + memFn                                                                                      | 抛错，登录路由返回 5xx                                         |
| `middleware/refreshToken.ts`       | `revokeRefreshTokenMemory` / `revokeAllUserSessionsMemory` + fallbackUserRevokedAt                                          | 抛错，路由返回 5xx                                             |
| `middleware/tokenRotation.ts`      | `refreshAccessTokenMemory`                                                                                                  | 抛错，刷新路由返回 5xx                                         |
| `queues/jobIdempotency.ts`         | `memProcessing` / `memProcessed` / `memResults` + memFn                                                                     | 抛错，Worker 重试（BullMQ backoff）                            |
| `middleware/idempotency.ts`        | `fallbackStore` / `handleWithMemory` / 清理定时器                                                                           | `sendProblem(res, 503, 'REDIS_UNAVAILABLE', ..., Retry-After)` |
| `middleware/authShared.ts`         | `fallbackRefreshTokenStore` / `fallbackTokenFamilyStore` / `fallbackUserFamilies` + generateRefreshToken 的 else/catch 分支 | 抛错                                                           |

**`backtestResultCache.ts` 与 `dataCache.ts` 不在本 ADR 范围**（dataCache.ts 由 P0-01 子代理负责；backtestResultCache.ts 的缓存降级属于"性能降级"而非"安全降级"，留待后续 P1 清理）。

### 向后兼容

- **开发环境**（无 Sentinel）：保留 `REDIS_URL` 单实例模式回退。`REDIS_SENTINELS` 未设置时，`redisClient.ts` 用 `REDIS_URL` 创建普通 ioredis 连接。
- **生产环境**：必须配置 `REDIS_SENTINELS`。`config/index.ts` 优先读 `REDIS_SENTINELS`，否则回退 `REDIS_URL`。
- **导出接口不变**：`appRedis`、`redisConnection`、`getRedisHealth`、`markRedisUnhealthy` 签名保持，下游消费方无需改动。

## Consequences

- **优势**：
  - 消除 Redis 单点故障，master Pod 挂掉 < 30s 自动恢复
  - 删除内存降级反模式，HA 下不再有"静默降级导致跨 Pod 状态不一致"
  - 显式 503 + 告警让运维第一时间感知 Redis 故障
  - BullMQ / 应用层客户端透明（ioredis Sentinel 模式）
- **劣势**：
  - Redis Pod 数从 1 → 6（1 主 + 2 从 + 3 Sentinel），资源占用增加约 6x（每 Pod 64-256Mi）
  - 故障转移期间（< 30s）写入短暂失败，需客户端重试（ioredis 自动重连 + BullMQ 重试）
  - 运维需理解 Sentinel 仲裁与故障转移语义
- **风险**：
  - 脑裂：通过 `min-slaves-to-write=1` + `min-slaves-max-lag=10` 缓解（主节点失去从节点确认时拒绝写入）
  - 仲裁丢失：3 Sentinel 挂 2 个则无法故障转移，通过 PDB `minAvailable: 2` 缓解
  - 数据丢失：异步复制下故障转移可能丢失未同步的少量写入（< 10 秒），业务可接受（刷新令牌/限流/幂等键均为短 TTL 状态）
- **验证**：
  - 本地：`docker-compose up redis-master redis-replica-1 redis-replica-2 redis-sentinel-1 redis-sentinel-2 redis-sentinel-3`，停止 master 容器观察 Sentinel 选举
  - K8s：手动 `kubectl delete pod redis-master-0`，验证 Sentinel 切换 < 30s 且服务无感知
  - Prometheus 告警：Sentinel failover 触发时告警（见 `k8s/prometheus-rules.yaml`）

## References

- ADR-018 Redis 选型（本 ADR 取代其"降级策略：内存模式"）
- ADR-031 单引擎 fail-closed（同款"显式失败优于静默降级"哲学）
- ioredis Sentinel 文档：https://github.com/redis/ioredis#sentinel-mode
- Redis Sentinel 文档：https://redis.io/docs/management/sentinel/
