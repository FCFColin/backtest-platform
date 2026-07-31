# 灾难恢复 Runbook（DR Runbook）

## 恢复目标

RPO < 2 分钟（WAL 实时归档）；RTO: PG < 30min, 引擎 < 5min, 全量 < 4h。

## 备份策略

PG: WAL-G 每日全量 + 实时 WAL（保留 7 份）；Redis: RDB 快照（非持久化数据）；配置/密钥: K8s Secret + Git。

## 恢复流程

### PostgreSQL 故障

1. 确认故障（PgPoolWaiting 告警/应用报错）→ 2. `bash scripts/backup-restore.sh LATEST` → 3. 重放 WAL 到恢复点 → 4. 提升新主库并验证完整性

### Go 引擎宕机

确认 EngineUnavailable 告警 → 看 Pod 状态/日志（CrashLoopBackOff 查资源限制）→ `docker compose restart engine-go` / `kubectl rollout restart` → 验证 `curl :15004/api/engine/health`。

### 区域级灾难（全量恢复）

新区域部署基础设施 → 对象存储恢复 PG 全量 + WAL → 部署应用镜像（GHCR, 按 Git SHA）→ 验证全链路健康 → 切换 DNS。

## 演练计划

| 项目                      | 频率   |
| ------------------------- | ------ |
| PostgreSQL 恢复           | 每月   |
| Redis 故障转移 / 密钥轮换 | 每季度 |
| 全量区域切换              | 每年   |

详见 ADR-038。
