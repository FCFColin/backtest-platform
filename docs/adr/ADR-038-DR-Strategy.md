# ADR-038: 灾难恢复策略

## Status
Proposed

## Date
2025-07-25

## Context
回测平台作为金融量化工具，需要应对以下灾难场景：
- PostgreSQL 主库故障（数据丢失风险）
- Redis 集群故障（会话/缓存不可用）
- K8s 集群故障（服务不可用）
- 可用区故障（区域性中断）

当前系统依赖：
- PostgreSQL 单实例 + WAL-G 备份
- Redis Sentinel 高可用
- K8s 单集群部署

## Decision

### RTO/RPO 目标
| 场景 | RTO | RPO |
|---|---|---|
| Pod 故障 | 30s | 0 |
| 节点故障 | 2min | 0 |
| PostgreSQL 故障 | 15min | 5min（WAL-G 增量备份间隔） |
| 可用区故障 | 30min | 5min |
| 区域故障 | 4h | 1h（跨区域备份间隔） |

### 策略
1. **PostgreSQL**: WAL-G 基础备份（每日）+ WAL 归档（连续），PITR 恢复
2. **Redis**: Sentinel 自动故障转移（<10s），RDB 快照（每 5min）
3. **K8s**: 多 AZ 部署（topology spread constraints），PodDisruptionBudget 保证最小可用
4. **对象存储**: MinIO 跨 AZ 纠删码，S3 兼容 API 备份到云存储
5. **回测结果**: 定期导出到对象存储（每小时），365 天保留

### 恢复流程
1. 检测故障（Prometheus 告警 → Alertmanager → On-call）
2. 评估范围（单 Pod / 节点 / AZ / 区域）
3. 执行恢复 runbook（见 `docs/runbooks/`）
4. 验证数据完整性
5. 恢复流量

## Consequences
- PostgreSQL RPO 5min 取决于 WAL 归档频率，可通过缩短归档间隔降低
- 跨区域恢复需要 4h（RTO），涉及 DNS 切换 + 数据恢复
- 需要定期 DR 演练（每季度）验证恢复流程

## Related
- `scripts/backup-full.sh` — 全量备份脚本
- `scripts/backup-restore.sh` — 恢复脚本
- `scripts/verify-backup.sh` — 备份验证
- `docs/runbooks/` — 恢复 runbook
