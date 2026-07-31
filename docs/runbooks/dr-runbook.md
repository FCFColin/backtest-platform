# 灾难恢复 Runbook（DR Runbook）

## 恢复目标

| 指标 | 目标                               |
| ---- | ---------------------------------- |
| RPO  | < 2 分钟(WAL 实时归档)             |
| RTO  | PG < 30min, 引擎 < 5min, 全量 < 4h |

## 备份策略

| 组件       | 方案                      | 保留     |
| ---------- | ------------------------- | -------- |
| PostgreSQL | WAL-G 每日全量 + 实时 WAL | 7 份全量 |
| Redis      | RDB 快照(非持久化数据)    | 不保证   |
| 配置/密钥  | K8s Secret + Git          | Git 历史 |

## 恢复流程

### PostgreSQL 故障

1. 确认故障(PgPoolWaiting 告警或应用报错)
2. bash scripts/backup-restore.sh LATEST(从最新备份恢复)
3. 重放 WAL 到恢复点
4. 提升为新主库, 验证数据完整性

### Go 引擎宕机

1. 确认 EngineUnavailable 告警
2. 查看 Pod 状态与日志
3. 如 CrashLoopBackOff, 检查资源限制
4. docker compose restart engine-go / kubectl rollout restart
5. 验证: curl http://localhost:15004/api/engine/health

### 区域级灾难(全量恢复)

1. 在新区域部署基础设施(K8s + PG + Redis)
2. 从对象存储恢复 PostgreSQL 全量 + WAL
3. 部署应用镜像(GHCR, 按 Git SHA)
4. 验证全链路健康检查
5. 切换 DNS 到新区域

## 演练计划

| 项目            | 频率   |
| --------------- | ------ |
| PostgreSQL 恢复 | 每月   |
| Redis 故障转移  | 每季度 |
| 密钥轮换        | 每季度 |
| 全量区域切换    | 每年   |

详见 ADR-038。
