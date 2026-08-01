-- Consolidated rollback (rebaselined)

-- 045_financial_numeric_cutover_down.sql
-- =============================================================================
-- 回滚迁移 v45：金融金额列 NUMERIC(19,6) -> DOUBLE PRECISION
-- 描述：将 prices/cpi_data/exchange_rates 金额列回退为 DOUBLE PRECISION
-- =============================================================================
-- ⚠️ 数据丢失警告：NUMERIC -> DOUBLE PRECISION 会丢失精度（浮点近似）。
--   回测精度会退化至 039 之前的状态。仅在紧急回滚时使用，回滚后建议尽快重新执行 v45。
--   *_numeric 双写列（039）不受影响，Go data-fetcher 仍正常写入。

-- 1. 临时删除 CHECK 约束
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_ohlc_check;
ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_close_positive;
ALTER TABLE cpi_data DROP CONSTRAINT IF EXISTS chk_cpi_value_positive;
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS chk_exchange_rate_positive;

-- 2. 回退为 DOUBLE PRECISION（精度损失不可逆）
ALTER TABLE prices ALTER COLUMN open TYPE DOUBLE PRECISION USING open::double precision;
ALTER TABLE prices ALTER COLUMN high TYPE DOUBLE PRECISION USING high::double precision;
ALTER TABLE prices ALTER COLUMN low TYPE DOUBLE PRECISION USING low::double precision;
ALTER TABLE prices ALTER COLUMN close TYPE DOUBLE PRECISION USING close::double precision;
ALTER TABLE prices ALTER COLUMN adjusted_close TYPE DOUBLE PRECISION USING adjusted_close::double precision;

ALTER TABLE cpi_data ALTER COLUMN value TYPE DOUBLE PRECISION USING value::double precision;
ALTER TABLE exchange_rates ALTER COLUMN rate TYPE DOUBLE PRECISION USING rate::double precision;

-- 3. 重建 CHECK 约束（与 003/008 定义一致）
ALTER TABLE prices ADD CONSTRAINT prices_ohlc_check CHECK (
  high >= low
  AND low <= open
  AND low <= close
  AND high >= open
  AND high >= close
  AND volume >= 0
);

ALTER TABLE prices ADD CONSTRAINT chk_prices_close_positive
  CHECK (close IS NULL OR close > 0);

ALTER TABLE cpi_data ADD CONSTRAINT chk_cpi_value_positive CHECK (value > 0);

ALTER TABLE exchange_rates ADD CONSTRAINT chk_exchange_rate_positive CHECK (rate > 0);

-- 044_user_roles_role_id_idx_down.sql
DROP INDEX IF EXISTS idx_fk_user_roles_role_id;

-- 043_api_keys_hash_check_down.sql
-- 回滚 v43：恢复 key_hash NOT NULL（仅在所有行都有 key_hash 时安全）
-- 注意：如果已有仅含 key_hash_argon2 的行，回滚会失败
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_hash_present;
-- 不恢复 NOT NULL：已有 argon2-only 密钥会导致失败
-- ALTER TABLE api_keys ALTER COLUMN key_hash SET NOT NULL;
-- 042_updated_at_triggers_down.sql
-- 回滚 v42：删除 updated_at 触发器
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP TRIGGER IF EXISTS trg_tickers_updated_at ON tickers;
DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON portfolios;
DROP TRIGGER IF EXISTS trg_saved_configs_updated_at ON saved_configs;
DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS trg_stripe_customers_updated_at ON stripe_customers;
DROP FUNCTION IF EXISTS set_updated_at();
-- 041_drop_redundant_indexes_down.sql
-- 回滚 v41：重建被删除的冗余索引（不推荐，仅为回滚完整性）
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
-- 040_fk_indexes_down.sql
-- =============================================================================
-- 回滚迁移 v40：移除外键列索引
-- 描述：仅删除本迁移创建的 6 个 idx_fk_* 索引；不动表结构与既有索引。
-- =============================================================================

DROP INDEX IF EXISTS idx_fk_invitations_invited_by;
DROP INDEX IF EXISTS idx_fk_announcements_created_by;
DROP INDEX IF EXISTS idx_fk_backtest_runs_owner_user_id;
DROP INDEX IF EXISTS idx_fk_saved_configs_owner_user_id;
DROP INDEX IF EXISTS idx_fk_portfolios_owner_user_id;
DROP INDEX IF EXISTS idx_fk_api_keys_created_by;
-- 039_prices_numeric_down.sql
-- =============================================================================
-- 回滚迁移 v39：移除 prices 新增的 NUMERIC 列与索引
-- 描述：仅回滚本迁移新增列；不动原 DOUBLE 列（数据未变）。
-- =============================================================================

DROP INDEX IF EXISTS idx_prices_ticker_close_numeric;
ALTER TABLE prices DROP COLUMN IF EXISTS adjusted_close_numeric;
ALTER TABLE prices DROP COLUMN IF EXISTS close_numeric;
ALTER TABLE prices DROP COLUMN IF EXISTS low_numeric;
ALTER TABLE prices DROP COLUMN IF EXISTS high_numeric;
ALTER TABLE prices DROP COLUMN IF EXISTS open_numeric;
-- 038_backtest_runs_default_status_down.sql
-- =============================================================================
-- 回滚迁移 v38：恢复 backtest_runs.status 默认 completed + 原始 CHECK
-- =============================================================================

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS backtest_runs_status_check;
ALTER TABLE backtest_runs
  ADD CONSTRAINT backtest_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE backtest_runs ALTER COLUMN status SET DEFAULT 'completed';
-- 037_invitations_rls_down.sql
-- =============================================================================
-- 回滚迁移 v37：invitations RLS 幂等校验的回滚
-- 描述：037 本身为幂等 no-op（实际 RLS 由 032 负责），无可回滚的副作用。
--       不在此处禁用 RLS（会破坏 032 的租户隔离，泄露被邀请邮箱 PII），
--       回滚 invitations RLS 需执行 032_enable_rls_api_keys_invitations_down.sql。
-- =============================================================================
-- 空操作：037 未引入任何 schema 变更（ENABLE/FORCE RLS 与 CREATE POLICY 在 032 已存在时为 no-op）。
SELECT 1;
-- 036_audit_logs_down.sql
-- =============================================================================
-- 回滚迁移 v36：移除 audit_logs 新增的 user_agent / metadata 列与索引
-- 描述：仅回滚本迁移新增的列与索引；不删除表（022 拥有）、不关闭 RLS（024/031 拥有）。
-- =============================================================================

DROP INDEX IF EXISTS idx_audit_logs_metadata_gin;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_agent;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata;
-- 035_prices_hypertable_down.sql
-- =============================================================================
-- 回滚迁移 v35：prices hypertable 幂等校验的回滚
-- 描述：035 本身为幂等 no-op（实际转换由 018 负责），无可回滚的副作用。
--       不在此处 un-hypertable（会破坏 018 的分区结构与 CAGG），回滚 prices
--       转换需执行 018_timescaledb_down.sql。
-- =============================================================================
-- 空操作：035 未引入任何 schema 变更（create_hypertable 在已转换时为 no-op）。
SELECT 1;
-- 034_webhook_secret_encrypt_down.sql
-- =============================================================================
-- 回滚迁移 v34：恢复 secret 为明文 text，移除加密元数据列
-- 描述：回滚 v34（注意：密文无法还原为原明文，secret 置 NULL）
-- =============================================================================

ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS secret_kid;
ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS secret_tag;
ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS secret_iv;

ALTER TABLE webhook_endpoints ALTER COLUMN secret DROP NOT NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret TYPE text USING NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret SET NOT NULL;

-- 033_backtest_app_grants_down.sql
-- =============================================================================
-- 回滚迁移 v33：撤销 backtest_app 全表授权与默认权限
-- 描述：回滚 v33
-- =============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM backtest_app;

REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM backtest_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM backtest_app;

REVOKE USAGE ON SCHEMA public FROM backtest_app;

-- 032_enable_rls_api_keys_invitations_down.sql
-- =============================================================================
-- 回滚迁移 v32：移除 api_keys/invitations RLS 策略并删除 org_memberships 表
-- 描述：回滚 v32
-- =============================================================================

DROP POLICY IF EXISTS org_memberships_tenant_isolation ON org_memberships;
DROP POLICY IF EXISTS invitations_tenant_isolation ON invitations;
DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;

ALTER TABLE org_memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE org_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys NO FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;

-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS org_memberships;

-- 031_force_rls_down.sql
-- =============================================================================
-- 回滚迁移 v31：解除 FORCE ROW LEVEL SECURITY（C-002）
-- 描述：回滚 v31，对相关表取消 FORCE（保留 ENABLE 状态）
-- =============================================================================

ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_tickers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries NO FORCE ROW LEVEL SECURITY;

-- 030_custom_tickers_down.sql
-- Migration: 030_custom_tickers (down)
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS custom_tickers;

-- 029_announcements_down.sql
-- Migration: 029_announcements (down)
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS announcements;

-- 028_placeholder_down.sql
-- =============================================================================
-- 回滚迁移 v28：no-op 占位，无副作用可回滚
-- 描述：v28 为 SELECT 1 no-op，回滚同样无操作。
-- =============================================================================

SELECT 1;

-- 027_timescale_cagg_down.sql
-- =============================================================================
-- P4-3 DOWN: 回滚 TimescaleDB CAGG 扩展
-- =============================================================================

-- 移除压缩策略
SELECT remove_compression_policy('daily_aggregate', if_exists => true);
SELECT remove_compression_policy('weekly_aggregate', if_exists => true);

-- 删除 CAGG 视图
DROP MATERIALIZED VIEW IF EXISTS daily_aggregate;
DROP MATERIALIZED VIEW IF EXISTS weekly_aggregate;

-- 026_tactical_configs_down.sql
-- P1-1: 战术配置持久化 — 回滚迁移

DROP TRIGGER IF EXISTS tactical_configs_updated_at ON tactical_configs;
DROP POLICY IF EXISTS tactical_configs_tenant_isolation ON tactical_configs;
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS tactical_configs;

-- 025_audit_chain_down.sql
-- 025_audit_chain DOWN: 移除 prev_hash 列
DROP INDEX IF EXISTS idx_audit_logs_chain;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS prev_hash;

-- 024_rls_extension_down.sql
-- 024_rls_extension DOWN: 移除 RLS 策略

-- 1. webhook_endpoints
DROP POLICY IF EXISTS webhook_endpoints_tenant_isolation ON webhook_endpoints;
ALTER TABLE webhook_endpoints DISABLE ROW LEVEL SECURITY;

-- 2. webhook_deliveries
DROP POLICY IF EXISTS webhook_deliveries_tenant_isolation ON webhook_deliveries;
ALTER TABLE webhook_deliveries DISABLE ROW LEVEL SECURITY;

-- 3. audit_logs
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- 4. stripe_customers
DROP POLICY IF EXISTS stripe_customers_tenant_isolation ON stripe_customers;
ALTER TABLE stripe_customers DISABLE ROW LEVEL SECURITY;

-- 5. stripe_subscriptions
DROP POLICY IF EXISTS stripe_subscriptions_tenant_isolation ON stripe_subscriptions;
ALTER TABLE stripe_subscriptions DISABLE ROW LEVEL SECURITY;

-- 023_cagg_backfill_down.sql
-- 描述：回滚 CAGG 回填 + 刷新策略调整（P1-01）
-- =============================================================================
-- 迁移 v23 回滚：恢复旧的 CAGG 刷新策略
-- =============================================================================
-- 注意：CAGG 历史数据回填不可逆（已物化的数据不会自动清除）。
-- 如需清空 CAGG 数据，可执行：TRUNCATE prices_monthly;
-- 本回滚仅恢复刷新策略参数到迁移 018 的原始配置。
-- =============================================================================

-- 1. 移除新策略
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
      AND hypertable_name = 'prices_monthly'
  ) THEN
    PERFORM remove_continuous_aggregate_policy('prices_monthly');
    RAISE NOTICE 'Removed CAGG refresh policy (v23)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CAGG policy removal skipped: %', SQLERRM;
END $$;

-- 2. 恢复迁移 018 的原始策略
SELECT add_continuous_aggregate_policy(
  'prices_monthly',
  start_offset => INTERVAL '1 month',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- 022_audit_storage_down.sql
-- =============================================================================
-- 回滚迁移 v22：不可篡改审计存储（P2-03）— 删除 audit_logs 表
-- 描述：回滚 v22，删除持久化审计日志表及其索引
-- =============================================================================
-- ⚠️ 数据丢失警告：DROP TABLE 会永久删除所有审计日志，不可恢复（P2-03 不可篡改存储）。

DROP TABLE IF EXISTS audit_logs;

-- 021_webhooks_down.sql
-- =============================================================================
-- 回滚迁移 v21：Webhook 系统（P2-02）— 删除端点配置与投递历史表
-- 描述：回滚 v21，删除 webhook_endpoints 与 webhook_deliveries 表及触发器
-- =============================================================================

DROP TRIGGER IF EXISTS set_webhook_endpoints_updated_at ON webhook_endpoints;
DROP FUNCTION IF EXISTS trg_webhook_endpoints_updated_at();

-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;

-- 020_custom_rbac_down.sql
-- =============================================================================
-- 回滚迁移 v20：可配置 RBAC（P2-01）— 删除自定义角色相关表与列
-- 描述：回滚 v20，删除 roles/role_permissions/user_roles 表与 portfolios.visible_to_roles 列
-- =============================================================================

ALTER TABLE portfolios DROP COLUMN IF EXISTS visible_to_roles;

-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;

-- 019_security_compliance_down.sql
-- =============================================================================
-- 回滚迁移 v19：等保三级合规（P1-09）— 删除 MFA + 密码历史 + 登录审计
-- 描述：回滚 v19，删除新增表与列
-- =============================================================================

DROP VIEW IF EXISTS v_admin_users_without_mfa;
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS login_events;
DROP TABLE IF EXISTS password_history;

ALTER TABLE users DROP COLUMN IF EXISTS password_must_change;
ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_backup_codes;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_secret;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_enabled;

-- 018_timescaledb_down.sql
-- =============================================================================
-- 迁移 v18 回滚：TimescaleDB 时序优化（P1-02）
-- =============================================================================
-- 注意：TimescaleDB hypertable 转换不完全可逆。本回滚脚本：
-- 1. 删除 Continuous Aggregate（prices_monthly）
-- 2. 移除压缩策略
-- 3. 删除 CAGG 刷新策略
-- 4. 保留 hypertable 结构（转回普通表需导出数据、重建表、导入，超出迁移范围）
-- 5. 恢复 prices_pkey 主键约束（id BIGSERIAL）
--
-- 企业理由：生产环境不建议回滚 TimescaleDB 迁移；如确需回退，
-- 应通过 PITR（WAL-G 备份恢复）回到迁移前状态，而非执行此脚本。
-- =============================================================================

-- 1. 删除 CAGG 刷新策略
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
      AND hypertable_name = 'prices_monthly'
  ) THEN
    PERFORM remove_continuous_aggregate_policy('prices_monthly');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. 删除 Continuous Aggregate
DROP MATERIALIZED VIEW IF EXISTS prices_monthly;

-- 3. 移除压缩策略
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_compression'
      AND hypertable_name = 'prices'
  ) THEN
    PERFORM remove_compression_policy('prices');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. 解除压缩设置（已压缩的 chunk 保持压缩状态，需手动 decompress）
ALTER TABLE prices SET (
  timescaledb.compress = false
);

-- 5. 恢复原始主键约束（id 列）
-- 注意：hypertable 转换时删除了 prices_pkey(id)，
-- 此处恢复主键。如 hypertable 仍存在，此约束需包含 date 列。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prices_pkey'
  ) THEN
    -- 如果仍是 hypertable，主键必须包含分区列 date
    IF EXISTS (
      SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'prices'
    ) THEN
      ALTER TABLE prices ADD CONSTRAINT prices_pkey PRIMARY KEY (id, date);
    ELSE
      ALTER TABLE prices ADD CONSTRAINT prices_pkey PRIMARY KEY (id);
    END IF;
  END IF;
END $$;

-- 注：不卸载 timescaledb 扩展（其他表可能依赖），不将 hypertable 转回普通表。
-- 完整回退需通过数据库备份恢复（WAL-G PITR）。

-- 017_admin_api_key_db_down.sql
-- =============================================================================
-- 回滚 v17：撤销 ADMIN_API_KEY 安全加固迁移
-- 描述：回滚平台密钥移入 DB、生命周期与 argon2id 列；删除平台密钥行后恢复 org_id NOT NULL。
-- =============================================================================
-- 注意：若已存在 is_platform_admin=TRUE 的密钥记录（org_id NULL），
-- 必须先删除这些行，否则恢复 org_id NOT NULL 约束会失败。

DELETE FROM api_keys WHERE is_platform_admin = TRUE;

DROP INDEX IF EXISTS idx_api_keys_expires;
DROP INDEX IF EXISTS idx_api_keys_platform_admin;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_expires_max_90d;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_org_or_platform;

-- 恢复 org_id NOT NULL（仅当不存在 NULL 行时成功，上面 DELETE 已保证）
ALTER TABLE api_keys ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE api_keys DROP COLUMN IF EXISTS key_hash_argon2;
ALTER TABLE api_keys DROP COLUMN IF EXISTS expires_at;
ALTER TABLE api_keys DROP COLUMN IF EXISTS is_platform_admin;

-- 016_backtest_progress_down.sql
-- =============================================================================
-- 回滚 v16：删除 backtest_runs.progress_pct 列与约束
-- =============================================================================
-- 注意：回滚会丢失已记录的进度数据，生产环境不建议回滚。

ALTER TABLE backtest_runs DROP CONSTRAINT IF EXISTS chk_backtest_runs_progress_pct;
ALTER TABLE backtest_runs DROP COLUMN IF EXISTS progress_pct;

-- 015_add_exchange_column_down.sql
-- =============================================================================
-- 回滚 v15：删除 tickers.exchange 列与索引
-- =============================================================================
-- 注意：回滚会丢失已回填的 exchange 数据，生产环境不建议回滚。

DROP INDEX IF EXISTS idx_tickers_exchange;
ALTER TABLE tickers DROP COLUMN IF EXISTS exchange;

-- 014_drop_chk_prices_volume_nonnegative_down.sql
-- =============================================================================
-- 回滚 v14：恢复 CHECK 约束 chk_prices_volume_nonnegative
-- =============================================================================

-- 恢复冗余约束（回滚用，生产环境不建议保留——prices_ohlc_check 已等价覆盖）
ALTER TABLE prices
  ADD CONSTRAINT chk_prices_volume_nonnegative CHECK (volume IS NULL OR volume >= 0);

-- 013_drop_redundant_index_down.sql
-- =============================================================================
-- 回滚 v13：恢复冗余索引 idx_users_username
-- =============================================================================

-- 重建冗余索引（回滚用，生产环境不建议保留——UNIQUE 约束已自动创建等价索引）
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 012_usage_down.sql
-- 012 回滚：移除用量计量与配额表（ADR-037）
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS usage_counters;
DROP TABLE IF EXISTS usage_events;

-- 011_billing_down.sql
-- 011 回滚：移除 Stripe 计费表（ADR-036）
-- ⚠️ 数据丢失警告：DROP TABLE 会永久删除订阅与 Stripe 客户映射数据，不可恢复。
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS stripe_customers;

-- 010_user_email_down.sql
-- 010 回滚：移除自助注册与邀请相关 schema（ADR-035）
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS email_verification_tokens;
DROP INDEX IF EXISTS idx_users_email_unique;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE users DROP COLUMN IF EXISTS email;

-- 009_tenancy_down.sql
-- 009 回滚：移除多租户隔离（RLS 策略 + 租户表 + 控制平面表 + outbox 列）
-- ⚠️ 数据丢失警告：DROP TABLE 会永久删除 backtest_runs/saved_configs/portfolios/
--   api_keys/memberships/organizations 全部业务数据，仅在新环境或备份后执行。

-- 1. 删除 RLS 策略（表删除会一并移除策略，此处显式以便单独回滚验证）
DROP POLICY IF EXISTS tenant_isolation_portfolios ON portfolios;
DROP POLICY IF EXISTS tenant_isolation_saved_configs ON saved_configs;
DROP POLICY IF EXISTS tenant_isolation_backtest_runs ON backtest_runs;

-- 2. 删除租户数据表
DROP TABLE IF EXISTS backtest_runs;
DROP TABLE IF EXISTS saved_configs;
DROP TABLE IF EXISTS portfolios;

-- 3. 移除 outbox 租户归因列
DROP INDEX IF EXISTS idx_outbox_tenant;
ALTER TABLE outbox DROP COLUMN IF EXISTS tenant_id;

-- 4. 删除控制平面表（先删依赖 organizations 的表）
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS organizations;

-- 5. 移除平台管理员列
ALTER TABLE users DROP COLUMN IF EXISTS is_platform_admin;

-- 008_checks_down.sql
-- 回滚 v8 CHECK 约束

ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_close_positive;
ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_volume_nonnegative;
ALTER TABLE cpi_data DROP CONSTRAINT IF EXISTS chk_cpi_value_positive;
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS chk_exchange_rate_positive;

-- 007_least_privilege_down.sql
-- 回滚 T-21 最小权限角色
-- 注意：删除角色前需先回收其权限，且该角色不能拥有对象。
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM backtest_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM backtest_app;
REVOKE USAGE ON SCHEMA public FROM backtest_app;
DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM backtest_app', current_database());
END
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM backtest_app;
DROP ROLE IF EXISTS backtest_app;

-- 006_outbox_dedup_down.sql
-- 回滚 ADR-024 / T-11 Outbox 去重强化
DROP INDEX IF EXISTS uq_outbox_event_id;
ALTER TABLE outbox DROP COLUMN IF EXISTS event_id;

-- 005_outbox_down.sql
DROP INDEX IF EXISTS idx_outbox_aggregate;
DROP INDEX IF EXISTS idx_outbox_unprocessed;
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS outbox;

-- 004_users_down.sql
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS users;

-- 003_index_cleanup_down.sql
-- =============================================================================
-- 回滚 v3：恢复冗余索引 + 删除 CHECK 约束
-- =============================================================================

ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_ohlc_check;
-- 重建冗余索引（回滚用，生产环境不建议保留）
CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);

-- 002_fts_down.sql
-- =============================================================================
-- 回滚 v2：删除全文搜索
-- =============================================================================

DROP TRIGGER IF EXISTS trg_tickers_search_vector ON tickers;
DROP FUNCTION IF EXISTS update_ticker_search_vector();
DROP INDEX IF EXISTS idx_tickers_search;

-- 001_init_down.sql
-- =============================================================================
-- 回滚 v1：删除初始 schema
-- =============================================================================
-- 企业理由：每个迁移必须有对应的 down 文件（I-3），
-- 生产回滚时按版本降序执行 down 文件。
-- 权衡：down 文件需手动维护与 up 文件的对称性。
-- ⚠️ 数据丢失警告：DROP TABLE 会永久删除全部业务数据（prices/tickers/cpi_data/exchange_rates），
--   仅在全新环境或确认数据已备份后执行。

DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS cpi_data;
DROP TABLE IF EXISTS prices;
DROP TABLE IF EXISTS tickers;

