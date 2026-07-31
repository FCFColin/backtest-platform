# ADR-038: 灾难恢复策略

| 状态 | 已接受 | 日期 | 2026-06-26 | 关联 | ADR-007, ADR-018 |

## Context

多租户 SaaS 需要明确的灾难恢复策略，确保数据安全和业务连续性。PostgreSQL 是核心数据存储，Redis 是认证/限流依赖。

## Decision

### RTO/RPO 目标

- RPO < 2 分钟(WAL 实时归档)
- RTO: PostgreSQL < 30min, Go 引擎 < 5min, 全量恢复 < 4h

### 策略

- PostgreSQL: WAL-G 每日全量 + 实时 WAL 归档 to MinIO/S3, 保留 7 份全量
- Redis: RDB 快照(非持久化数据不保证恢复)
- 配置/密钥: K8s Secret + Git 版本控制
- 区域级灾难: 从对象存储恢复 PG, 部署应用镜像, 切换 DNS
- 演练: PG 恢复每月, Redis 故障转移每季度, 全量切换每年

## Consequences

- (+) 明确的 RTO/RPO 目标和恢复流程
- (+) 定期演练确保恢复流程可靠
- (-) WAL-G + 对象存储引入运维依赖
- 详见 runbooks/dr-runbook.md
