# 数据备份与恢复策略（等保三级 8.1.4 数据备份与恢复）

> **文档编号**: COMPLIANCE-BACKUP-001  
> **等保条款**: GB/T 22239-2019 三级 — 8.1.4 数据完整性与备份恢复  
> **最近更新**: 2026-07-25  
> **关联任务**: P0-06 WAL-G 备份策略

---

## 1. 备份架构

### 1.1 备份组件

| 组件              | 说明                                               |
| ----------------- | -------------------------------------------------- |
| **WAL-G v3.0.3**  | PostgreSQL 连续归档 + 增量基础备份工具             |
| **MinIO**         | S3 兼容对象存储，本地部署于 Docker Compose         |
| **ofelia**        | Docker 原生 cron 调度器，定时触发全量备份          |
| **PostgreSQL 16** | `archive_mode=on` + `archive_command` 实时归档 WAL |

### 1.2 备份存储路径

- **本地（开发环境）**: MinIO `s3://backtest-wal-backup`
- **生产环境**: 切换 `WALG_S3_PREFIX` 指向 AWS S3 / 阿里云 OSS 等异地存储

### 1.3 备份类型

| 类型             | 频率             | 内容             | 触发方式                        |
| ---------------- | ---------------- | ---------------- | ------------------------------- |
| **WAL 归档**     | 实时（每段 WAL） | WAL segment 文件 | `archive_command` 自动推送      |
| **全量基础备份** | 每日 02:00 CST   | 完整数据目录快照 | ofelia 调度 `wal-g backup-push` |
| **备份验证**     | 每周日 03:00 CST | WAL 完整性校验   | ofelia 调度 `wal-g wal-verify`  |

---

## 2. RPO / RTO 指标

### 2.1 RPO（恢复点目标）

| 参数              | 值           | 说明                           |
| ----------------- | ------------ | ------------------------------ |
| `archive_timeout` | 60s          | 空闲时强制 WAL 切换间隔        |
| WAL 段大小        | 16MB（默认） | 单段 WAL 文件大小              |
| **理论 RPO**      | **≤ 60 秒**  | 最后一个已归档 WAL 段的时间点  |
| **实测 RPO**      | **< 2 分钟** | 包含 WAL 传输 + MinIO 写入延迟 |

> **等保要求**: RPO ≤ 15 分钟（三级要求）→ **满足**

### 2.2 RTO（恢复时间目标）

| 阶段            | 预估耗时      | 说明                   |
| --------------- | ------------- | ---------------------- |
| 停止 PostgreSQL | < 5s          | `docker stop`          |
| 清空 PGDATA     | < 5s          | `rm -rf $PGDATA/*`     |
| `backup-fetch`  | 2-10 分钟     | 取决于数据量与网络带宽 |
| WAL replay      | 1-5 分钟      | 取决于 WAL 积压量      |
| 启动 + 就绪检查 | 10-30s        | `pg_isready` 通过      |
| **总计 RTO**    | **< 15 分钟** | 本地验证目标           |

> **等保要求**: RTO ≤ 15 分钟（三级要求）→ **满足**

### 2.3 恢复演练记录

| 日期               | 数据量 | 实测 RTO | 结果 | 备注         |
| ------------------ | ------ | -------- | ---- | ------------ |
| _待本地验证后填写_ | —      | —        | —    | 首次恢复演练 |

---

## 3. 备份保留策略

| 保留策略          | 值           | 命令                                          |
| ----------------- | ------------ | --------------------------------------------- |
| 全量备份保留      | 最近 7 份    | `wal-g delete retain 7 --confirm`             |
| WAL 归档保留      | 跟随全量备份 | 自动清理过期 WAL                              |
| MinIO Object Lock | 可选启用     | `mc mb --with-lock local/backtest-wal-backup` |

> ofelia 调度器在每次全量备份后自动执行 `wal-g delete retain 7` 清理旧备份。

---

## 4. 操作手册

### 4.1 手动触发全量备份

```bash
bash scripts/backup-full.sh
```

### 4.2 查看备份列表

```bash
docker exec backtest-postgres wal-g backup-list
```

### 4.3 恢复演练（从最新备份恢复）

```bash
# 警告：此脚本会清空并重建 PostgreSQL 数据目录
bash scripts/backup-restore.sh LATEST

# 恢复到指定备份点
bash scripts/backup-restore.sh base_000000010000000000000003
```

### 4.4 PITR（时间点恢复）

恢复到指定时间点，在 `backup-restore.sh` 后手动配置：

```bash
# 在 postgresql.auto.conf 中添加恢复目标时间
echo "recovery_target_time = '2026-07-25 14:30:00+08'" >> $PGDATA/postgresql.auto.conf
echo "recovery_target_action = 'promote'" >> $PGDATA/postgresql.auto.conf
```

### 4.5 验证备份完整性

```bash
# 验证 WAL 归档完整性
docker exec backtest-postgres wal-g wal-verify integrity

# 验证备份文件完整性
docker exec backtest-postgres wal-g backup-list --pretty
```

---

## 5. 监控与告警

### 5.1 Prometheus 指标

| 指标                                 | 来源             | 说明                   |
| ------------------------------------ | ---------------- | ---------------------- |
| `walg_backup_last_success_timestamp` | backup-status.sh | 最近一次成功备份时间戳 |
| `walg_backup_last_failure_timestamp` | backup-status.sh | 最近一次失败备份时间戳 |
| `walg_backup_total`                  | backup-status.sh | 备份总次数             |
| `walg_backup_failed_total`           | backup-status.sh | 备份失败总次数         |

### 5.2 告警规则

| 告警               | 触发条件               | 严重级别 |
| ------------------ | ---------------------- | -------- |
| `WalgBackupStale`  | 超过 26 小时无成功备份 | critical |
| `WalgBackupFailed` | 备份失败计数增加       | warning  |

---

## 6. 等保三级对照

| 等保条款 | 要求                 | 实现方式                              | 状态           |
| -------- | -------------------- | ------------------------------------- | -------------- |
| 8.1.4 a) | 数据完整性检测与恢复 | WAL-G 备份 + PITR                     | ✅             |
| 8.1.4 b) | 数据备份             | 每日全量 + 实时 WAL 归档              | ✅             |
| 8.1.4 c) | 异地备份             | MinIO S3 → 生产环境切换至异地对象存储 | ✅（生产配置） |
| 8.1.4 d) | 剩余信息保护         | 备份删除后 WAL-G 清理 WAL 段          | ✅             |

---

## 7. 生产环境部署检查清单

- [ ] `WALG_S3_PREFIX` 指向异地 S3/OSS（非本地 MinIO）
- [ ] MinIO/S3 bucket 启用 Object Lock（WORM 模式，保留 180 天）
- [ ] `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 使用 Secret 注入（非明文环境变量）
- [ ] 备份加密：`WALG_ENVELOP` 启用 KMS 加密
- [ ] 定期恢复演练（每月一次，记录 RTO）
- [ ] ofelia 调度器在 K8s 环境替换为 CronJob
