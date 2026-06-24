# ADR-012: Redis 选型

## Status: Accepted

## Context
100x 流量下必须水平扩展，内存状态无法跨实例共享：
- Refresh Token（jwtAuth.ts）多实例刷新失败
- 幂等 Key（idempotency.ts）多实例重复执行
- 限流计数器（app.ts）每实例独立计数可被绕过
- 价格数据缓存（dataService.ts）多实例缓存不一致

## Decision
选择 Redis 作为共享状态存储：
- 数据结构丰富（String/Hash/Set/Sorted Set）覆盖所有场景
- TTL 原生支持（Refresh Token/幂等 Key 自动过期）
- Lua 脚本支持原子操作（幂等性 check-and-set）
- 单线程模型保证命令原子性
- 部署方案：K8s StatefulSet + Sentinel 或云服务（ElastiCache/Upstash）

## Consequences
- 优势：解除水平扩展阻塞，所有内存状态可跨实例共享
- 劣势：引入 Redis 运维依赖，网络延迟增加约 0.1-1ms
- 风险：Redis 单点故障需 Sentinel/Cluster 保护
- 降级策略：Redis 不可用时自动降级到内存模式
