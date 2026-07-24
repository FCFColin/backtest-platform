# 灾难恢复 Runbook（DR Runbook）

> **企业理由**：生产级 SaaS 需明确的灾难恢复目标（RPO/RTO）与可执行的恢复流程。
> 本 runbook 覆盖数据库故障、Redis 不可用、引擎宕机、区域级灾难等场景。

---

## 1. 恢复目标

| 指标 | 目标 | 说明 |
| --- | --- | --- |
| **RPO** (Recovery Point Objective) | ≤ 15 分钟 | 数据丢失不超过 15 分钟（PostgreSQL WAL 归档 + 增量备份） |
| **RTO** (Recovery Time Objective) | ≤ 1 小时 | 从灾难发生到服务恢复不超过 1 小时 |
| **RTO - 引擎** | ≤ 10 分钟 | Go 引擎独立恢复（HPA 扩容 + 健康检查重启） |
| **RTO - 数据库** | ≤ 45 分钟 | PostgreSQL 从 WAL 归档 + 全量备份恢复 |

---

## 2. 备份策略

### 2.1 PostgreSQL（主数据存储）

| 备份类型 | 频率 | 保留 | 位置 |
| --- | --- | --- | --- |
| 全量备份 (pg_dump) | 每日 02:00 UTC | 30 天 | S3 `s3://backtest-backups/pg/` |
| WAL 归档 | 实时（archive_timeout=60s） | 7 天 | S3 `s3://backtest-backups/pg-wal/` |
| 增量基础备份 (pg_basebackup) | 每 6 小时 | 7 天 | S3 `s3://backtest-backups/pg-base/` |

### 2.2 Redis（会话/限流/缓存）

- **策略**：Redis 数据为易失性缓存（会话 Token、限流计数、幂等缓存），不纳入 RPO。
- **恢复**：Redis 故障时从 PostgreSQL 重建（用户重新登录，幂等缓存从 DB 读取）。
- **持久化**：AOF + RDB 双持久化（`appendonly yes` + `save 900 1`），仅用于实例重启不丢数据。

### 2.3 配置与密钥

- **k8s ConfigMaps/Secrets**：由 GitOps（ArgoCD）管理，版本化在 Git 仓库。
- **密钥轮换**：JWT_SECRET / ENGINE_AUTH_TOKEN / AUDIT_HMAC_KEY 每 90 天轮换。

---

## 3. 恢复流程

### 3.1 PostgreSQL 故障恢复

```bash
# 1. 确认故障（连接池告警 PgPoolWaiting 或应用报错）
kubectl logs -n backtest deployment/api | grep -i "database connection"

# 2. 从最新基础备份恢复
kubectl exec -n backtest postgres-0 -- pg_basebackup -D /tmp/restore -Fp -Xs -P

# 3. 重放 WAL 到恢复点
kubectl exec -n backtest postgres-0 -- pg_ctl -D /tmp/restore -o "-c recovery_target_time='2026-07-23 14:00:00'" start

# 4. 提升为新主库
kubectl exec -n backtest postgres-0 -- pg_ctl -D /tmp/restore promote

# 5. 验证数据完整性
kubectl exec -n backtest postgres-0 -- psql -c "SELECT count(*) FROM backtest_runs WHERE created_at > NOW() - INTERVAL '1 hour';"
```

### 3.2 Go 引擎宕机恢复

```bash
# 1. 确认引擎不可用（EngineUnavailable 告警）
kubectl get pods -n backtest -l app=engine-go

# 2. 查看 Pod 状态与日志
kubectl describe pod -n backtest -l app=engine-go
kubectl logs -n backtest -l app=engine-go --tail=100

# 3. 如果 CrashLoopBackOff，检查资源限制
kubectl get hpa -n backtest engine-go

# 4. 强制重启（如需）
kubectl rollout restart deployment/engine-go -n backtest

# 5. 验证引擎恢复
curl -s http://engine-go:5004/health | jq .
```

### 3.3 区域级灾难（全量恢复）

1. **声明新区域**：在备用区域启动新的 k8s 集群
2. **恢复 PostgreSQL**：从 S3 拉取最新全量备份 + 重放 WAL
3. **恢复 Redis**：新实例（数据可丢失，用户重新登录）
4. **部署服务**：ArgoCD 同步所有微服务
5. **切换 DNS**：将流量指向新区域
6. **验证**：健康检查 + 烟雾测试

---

## 4. 演练计划

| 演练类型 | 频率 | 范围 | 验证 |
| --- | --- | --- | --- |
| PostgreSQL PITR | 每月 | 单实例 | 恢复到指定时间点，验证数据 |
| 引擎故障切换 | 每月 | engine-go Pod | 杀掉 Pod，验证 HPA 自动恢复 |
| 全量 DR 演练 | 每季度 | 全栈 | 备用区域全量恢复 + 烟雾测试 |

---

## 5. 联系人

| 角色 | 职责 | 联系方式 |
| --- | --- | --- |
| On-call SRE | 第一响应 | PagerDuty |
| DBA | PostgreSQL 专项 | Slack #db-ops |
| 架构组 | 决策升级 | Slack #architecture |

---

## 参考

- ADR-007: PostgreSQL 高可用（流复制 + WAL 归档）
- ADR-018: Redis 分布式 session/限流/缓存
- ADR-031: 单引擎 fail-closed（503 + Retry-After）
- `docs/alerts/infra-alerts.yml`: 告警规则
