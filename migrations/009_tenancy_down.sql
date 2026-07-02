-- 009 回滚：移除多租户隔离（RLS 策略 + 租户表 + 控制平面表 + outbox 列）

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
