# ADR-013: 退役死 schema（CAGG / visible_to_roles / queued 枚举 / 冗余索引）

| 状态 | 已接受 | 日期 | 2026-08-10 | 合并 | — | 关联 | ADR-005, ADR-009, ADR-012 |

## Context

全仓库收敛审计第二轮（ADR-012 之后的 schema 层）发现以下对象自引入起零查询消费者或零有效利用，保留仅增加 schema 面与维护面：

1. **daily_aggregate / weekly_aggregate 连续聚合视图**：001 建立后确认无任何查询消费者（仅 prices_monthly 有消费者）。
2. **portfolios.visible_to_roles**：无任何代码读写——多租户共享经 tenant_id / memberships 与 RLS（ADR-009）。
3. **backtest_runs.queued**：DB 层死枚举——应用层 domain 'queued' 由 `backtestRunRepo` STATUS_MAP 映射为 'pending' 写入，DB 默认值从未生效。
4. **idx_backtest_runs_tenant**：被 `idx_backtest_runs_tenant_created(tenant_id, created_at DESC)` 复合索引完全覆盖。
5. **idx_users_mfa_enabled**：布尔低选择性部分索引，无任何查询利用。
6. **004 迁移项（本轮补记）**：`prices.*_numeric` 列仅由 data-fetcher 写入、无任何读取方；`org_memberships` 零生产消费者（后端用 memberships）；`idx_ff_factors_date` 与 `fama_french_factors(date)` 主键索引重复；`prices_monthly` 缺 backtest_app SELECT 授权。
7. **users.mfa_secret / mfa_backup_codes**：MFA/TOTP 未实施，遗留死列（保留未删，供未来 MFA 恢复；`mfa_enabled` 仍被 `v_admin_users_without_mfa` 视图使用）。

## Decision

- 新增迁移 **004_remove_dead_schema**（numeric 列 / org_memberships / idx_ff_factors_date / prices_monthly 授权）与 **005_remove_dead_schema**（CAGG / visible_to_roles / queued / 冗余索引）删除以上对象；down 迁移按回滚演练语义保留重建语句（生产不降级）。
- 基线 **001 同步收敛**：移除 `idx_users_mfa_enabled` 创建与 `password_changed_at` UPDATE 空操作（迁移已应用库不受影响，仅全新初始化生效）；`001_down` 的 DROP 列表移除 `schema_migrations`（该表由 migrations.ts 管理，非业务 schema）。
- 删除门禁按决策原则执行：确认零消费者、无悬挂配置面、配套测试无删除（迁移层无专属测试）、本 ADR 独立提交。

## Consequences

- (+) 消除死 schema / 索引维护面；`backtest_runs.status` 枚举与应用层语义一致。
- (+) RLS 策略随 001 改为 `NULLIF(current_setting(...), '')` 转义空字符串，避免 `''::uuid` 解析失败（安全加固）。
- (-) 未来启用 CAGG 或动态可见性需重新引入（以本 ADR 为基线，成本显式可见）。
