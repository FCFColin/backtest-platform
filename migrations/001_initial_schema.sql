-- Consolidated initial schema (rebaselined 2026-08-01)
-- 独立 SQL 文件便于 DBA 审查与 git diff（I-3）

CREATE TABLE IF NOT EXISTS tickers (
  ticker VARCHAR(20) PRIMARY KEY, category VARCHAR(50) NOT NULL DEFAULT '', market VARCHAR(20) NOT NULL DEFAULT '',
  exchange VARCHAR(20) NOT NULL DEFAULT '', search_vector tsvector, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickers_exchange ON tickers(exchange);
CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY, ticker VARCHAR(20) NOT NULL REFERENCES tickers(ticker), date DATE NOT NULL,
  open NUMERIC(19, 6), high NUMERIC(19, 6), low NUMERIC(19, 6), close NUMERIC(19, 6), volume BIGINT, adjusted_close NUMERIC(19, 6),
  open_numeric NUMERIC(19, 6), high_numeric NUMERIC(19, 6), low_numeric NUMERIC(19, 6), close_numeric NUMERIC(19, 6), adjusted_close_numeric NUMERIC(19, 6),
  UNIQUE(ticker, date),
  CONSTRAINT prices_ohlc_check CHECK (high >= low AND low <= open AND low <= close AND high >= open AND high >= close AND volume >= 0),
  CONSTRAINT chk_prices_close_positive CHECK (close IS NULL OR close > 0)
);
CREATE INDEX IF NOT EXISTS idx_prices_date_brin ON prices USING BRIN(date);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_close_numeric ON prices (ticker, close_numeric);
CREATE TABLE IF NOT EXISTS cpi_data ( country VARCHAR(10) NOT NULL, date DATE NOT NULL, value NUMERIC(19, 6) NOT NULL, PRIMARY KEY (country, date), CONSTRAINT chk_cpi_value_positive CHECK (value > 0) );
CREATE TABLE IF NOT EXISTS exchange_rates ( base_currency VARCHAR(10) NOT NULL, target_currency VARCHAR(10) NOT NULL, date DATE NOT NULL, rate NUMERIC(19, 6) NOT NULL, PRIMARY KEY (base_currency, target_currency, date), CONSTRAINT chk_exchange_rate_positive CHECK (rate > 0) );
CREATE TABLE IF NOT EXISTS schema_migrations ( version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), description TEXT );

-- FTS search vector
CREATE INDEX IF NOT EXISTS idx_tickers_search ON tickers USING GIN(search_vector);
CREATE OR REPLACE FUNCTION update_ticker_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('simple', COALESCE(NEW.ticker, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.market, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_tickers_search_vector BEFORE INSERT OR UPDATE ON tickers FOR EACH ROW EXECUTE FUNCTION update_ticker_search_vector();
UPDATE tickers SET search_vector = setweight(to_tsvector('simple', COALESCE(ticker, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(category, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(market, '')), 'C') WHERE search_vector IS NULL;

-- users (多用户注册、密码哈希、角色分配，SOC 2/ISO 27001 可追溯)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username VARCHAR(50) NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_login_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true,
  is_platform_admin BOOLEAN NOT NULL DEFAULT false, email VARCHAR(255), email_verified_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE, mfa_secret TEXT, mfa_backup_codes TEXT[],
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), password_must_change BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;

-- Outbox (ADR-005: 事件与业务数据事务一致性)
CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type VARCHAR(100) NOT NULL, aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ,
  event_id UUID, tenant_id UUID,
  CONSTRAINT chk_processed_after_created CHECK (processed_at IS NULL OR processed_at >= created_at)
);
CREATE INDEX idx_outbox_unprocessed ON outbox (created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_outbox_aggregate ON outbox (aggregate_type, aggregate_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_event_id ON outbox (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_tenant ON outbox(tenant_id) WHERE tenant_id IS NOT NULL;

-- 最小权限角色 (T-21: 运行期账户仅 DML)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    CREATE ROLE backtest_app LOGIN PASSWORD 'change-me-in-deploy';
  END IF;
END $$;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO backtest_app', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO backtest_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO backtest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO backtest_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN ALTER ROLE backtest_app NOBYPASSRLS; END IF; END $$;

-- 多租户隔离 (ADR-009)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(120) NOT NULL, slug VARCHAR(80) NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS memberships (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, name VARCHAR(120) NOT NULL,
  key_hash TEXT UNIQUE, key_prefix VARCHAR(20) NOT NULL, created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE, expires_at TIMESTAMPTZ, key_hash_argon2 TEXT,
  CONSTRAINT api_keys_org_or_platform CHECK ((is_platform_admin = TRUE AND org_id IS NULL) OR (is_platform_admin = FALSE AND org_id IS NOT NULL)),
  CONSTRAINT api_keys_expires_max_90d CHECK (expires_at IS NULL OR expires_at <= NOW() + INTERVAL '90 days'),
  CONSTRAINT api_keys_hash_present CHECK (key_hash IS NOT NULL OR key_hash_argon2 IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(org_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_platform_admin ON api_keys(is_platform_admin) WHERE is_platform_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fk_api_keys_created_by ON api_keys (created_by);
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL, name VARCHAR(120) NOT NULL, assets JSONB NOT NULL,
  rebalance_frequency VARCHAR(20) NOT NULL DEFAULT 'none', visible_to_roles UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_portfolios_tenant ON portfolios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_portfolios_owner_user_id ON portfolios (owner_user_id);
CREATE TABLE IF NOT EXISTS saved_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL, name VARCHAR(120) NOT NULL, config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_configs_tenant ON saved_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_saved_configs_owner_user_id ON saved_configs (owner_user_id);
CREATE TABLE IF NOT EXISTS backtest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL, name VARCHAR(120), request JSONB NOT NULL, result JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_backtest_runs_progress_pct CHECK (progress_pct >= 0 AND progress_pct <= 100)
);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_tenant ON backtest_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_tenant_created ON backtest_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fk_backtest_runs_owner_user_id ON backtest_runs (owner_user_id);

-- RLS: 租户数据表 (ENABLE + FORCE + POLICY 批量)
DO $$ DECLARE t TEXT; col TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['portfolios','saved_configs','backtest_runs'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY; ALTER TABLE %s FORCE ROW LEVEL SECURITY', t, t);
    EXECUTE format($f$CREATE POLICY %1$s_tenant_isolation ON %1$s FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$f$, t);
  END LOOP;
END $$;

-- 自助注册与邀请 (ADR-009)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verification_tokens(user_id);
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  token_hash TEXT NOT NULL UNIQUE, invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL, accepted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending ON invitations(org_id, lower(email)) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fk_invitations_invited_by ON invitations (invited_by);

-- Stripe 计费 (ADR-010)
CREATE TABLE IF NOT EXISTS stripe_customers ( org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE, stripe_customer_id TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() );
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE, plan VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status VARCHAR(32) NOT NULL DEFAULT 'incomplete', current_period_end TIMESTAMPTZ, cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(org_id);

-- 用量计量与配额 (ADR-010)
CREATE TABLE IF NOT EXISTS usage_events ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, metric VARCHAR(40) NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() );
CREATE INDEX IF NOT EXISTS idx_usage_events_org_metric ON usage_events(org_id, metric, created_at);
CREATE TABLE IF NOT EXISTS usage_counters ( org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, period VARCHAR(7) NOT NULL, metric VARCHAR(40) NOT NULL, count INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (org_id, period, metric) );
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['usage_events','usage_counters'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY; ALTER TABLE %s FORCE ROW LEVEL SECURITY', t, t);
    EXECUTE format($f$CREATE POLICY %1$s_tenant_isolation ON %1$s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$f$, t);
  END LOOP;
END $$;

-- TimescaleDB hypertable + 列压缩 + CAGG (ADR-002)
CREATE EXTENSION IF NOT EXISTS timescaledb;
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_pkey;
SELECT create_hypertable('prices', 'date', chunk_time_interval => INTERVAL '3 months', migrate_data => TRUE, if_not_exists => TRUE);
DO $$ DECLARE ticker_count INTEGER; dim_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO ticker_count FROM tickers;
  SELECT EXISTS(SELECT 1 FROM timescaledb_information.dimensions WHERE hypertable_name = 'prices' AND column_name = 'ticker') INTO dim_exists;
  IF ticker_count > 10000 AND NOT dim_exists THEN PERFORM add_dimension('prices', 'ticker', number_partitions => 16); END IF;
END $$;
ALTER TABLE prices SET (timescaledb.compress, timescaledb.compress_segmentby = 'ticker', timescaledb.compress_orderby = 'date DESC');
SELECT add_compression_policy('prices', INTERVAL '6 months', if_not_exists => TRUE);
CREATE MATERIALIZED VIEW IF NOT EXISTS prices_monthly WITH (timescaledb.continuous) AS
SELECT ticker, time_bucket('1 month', date) AS month, first(open, date) AS open, max(high) AS high, min(low) AS low, last(close, date) AS close, sum(volume) AS volume
FROM prices GROUP BY ticker, time_bucket('1 month', date) WITH NO DATA;
SELECT add_continuous_aggregate_policy('prices_monthly', start_offset => INTERVAL '3 months', end_offset => INTERVAL '2 days', schedule_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_aggregate WITH (timescaledb.continuous) AS
SELECT ticker, time_bucket('1 day', date) AS day, first(open, date) AS open, max(high) AS high, min(low) AS low, last(close, date) AS close, sum(volume) AS volume
FROM prices GROUP BY ticker, time_bucket('1 day', date) WITH NO DATA;
CREATE MATERIALIZED VIEW IF NOT EXISTS weekly_aggregate WITH (timescaledb.continuous) AS
SELECT ticker, time_bucket('7 days', date) AS week, first(open, date) AS open, max(high) AS high, min(low) AS low, last(close, date) AS close, sum(volume) AS volume
FROM prices GROUP BY ticker, time_bucket('7 days', date) WITH NO DATA;
ALTER MATERIALIZED VIEW daily_aggregate SET (timescaledb.compress, timescaledb.compress_segmentby = 'ticker', timescaledb.compress_orderby = 'day DESC');
ALTER MATERIALIZED VIEW weekly_aggregate SET (timescaledb.compress, timescaledb.compress_segmentby = 'ticker', timescaledb.compress_orderby = 'week DESC');
SELECT add_compression_policy('daily_aggregate', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_compression_policy('weekly_aggregate', INTERVAL '30 days', if_not_exists => TRUE);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN GRANT SELECT ON daily_aggregate TO backtest_app; GRANT SELECT ON weekly_aggregate TO backtest_app; END IF; END $$;

-- 等保三级合规 (P1-09): MFA + 密码历史 + 登录审计
CREATE TABLE IF NOT EXISTS password_history ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW() );
CREATE INDEX IF NOT EXISTS idx_password_history_user_time ON password_history(user_id, changed_at DESC);
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, username VARCHAR(50),
  ip_address INET, user_agent TEXT, success BOOLEAN NOT NULL, failure_reason VARCHAR(50), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_events_user_time ON login_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_ip_time ON login_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at DESC);
CREATE OR REPLACE VIEW v_admin_users_without_mfa AS SELECT id, username, role, email, created_at FROM users WHERE role = 'admin' AND is_active = true AND mfa_enabled = false;

-- 可配置 RBAC (P2-01)
CREATE TABLE IF NOT EXISTS roles ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, name VARCHAR(80) NOT NULL, description TEXT, is_system BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT uq_roles_org_name UNIQUE (org_id, name) );
CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_system ON roles(is_system) WHERE is_system = TRUE;
CREATE TABLE IF NOT EXISTS role_permissions ( role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE, permission VARCHAR(60) NOT NULL, PRIMARY KEY (role_id, permission) );
CREATE TABLE IF NOT EXISTS user_roles ( user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE, org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_id, role_id) );
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fk_user_roles_role_id ON user_roles (role_id);
-- 系统角色种子 (中间件依赖，须与 CREATE TABLE 同迁移)
WITH admin_role AS (INSERT INTO roles (org_id, name, description, is_system) VALUES (NULL, 'admin', '系统管理员', TRUE) ON CONFLICT DO NOTHING RETURNING id),
analyst_role AS (INSERT INTO roles (org_id, name, description, is_system) VALUES (NULL, 'analyst', '分析师', TRUE) ON CONFLICT DO NOTHING RETURNING id),
readonly_role AS (INSERT INTO roles (org_id, name, description, is_system) VALUES (NULL, 'readonly', '只读用户', TRUE) ON CONFLICT DO NOTHING RETURNING id),
admin_perms AS (SELECT id AS role_id, perm FROM admin_role CROSS JOIN unnest(ARRAY['backtest:run','data:manage','data:read','admin:access','optimizer:run','signal:read','strategy:manage']) AS perm),
analyst_perms AS (SELECT id AS role_id, perm FROM analyst_role CROSS JOIN unnest(ARRAY['backtest:run','data:read','data:manage','optimizer:run','signal:read','strategy:manage']) AS perm),
readonly_perms AS (SELECT id AS role_id, perm FROM readonly_role CROSS JOIN unnest(ARRAY['data:read','signal:read']) AS perm),
all_perms AS (SELECT role_id, perm FROM admin_perms UNION ALL SELECT role_id, perm FROM analyst_perms UNION ALL SELECT role_id, perm FROM readonly_perms)
INSERT INTO role_permissions (role_id, permission) SELECT role_id, perm FROM all_perms ON CONFLICT DO NOTHING;

-- Webhook 系统 (P2-02): HMAC 签名 + 投递历史
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, url TEXT NOT NULL,
  secret BYTEA NOT NULL, secret_iv BYTEA, secret_tag BYTEA, secret_kid TEXT, description TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}', failed_consecutive_count INTEGER NOT NULL DEFAULT 0, disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON webhook_endpoints(org_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(org_id) WHERE is_active = TRUE;
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL, payload JSONB NOT NULL, status VARCHAR(20) NOT NULL CHECK (status IN ('pending','success','failed','retrying')),
  response_code INTEGER, response_body TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, next_retry_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_created ON webhook_deliveries(endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status IN ('pending','retrying');

-- 不可篡改审计存储 (P2-03): HMAC 签名 + MinIO WORM 导出
-- user_id/org_id 不加 FK: 审计记录须比用户/组织存活更久 (合规追溯)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), event_type VARCHAR(100) NOT NULL, user_id UUID, org_id UUID, ip_address INET,
  action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'READ', 'EXPORT', 'CONFIG')),
  resource_type VARCHAR(50), resource_id VARCHAR(100), payload JSONB NOT NULL, hmac_signature TEXT NOT NULL,
  object_key TEXT, exported_at TIMESTAMPTZ, prev_hash VARCHAR(64), user_agent TEXT, metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_unexported ON audit_logs(exported_at) WHERE exported_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_chain ON audit_logs (created_at ASC, id ASC) WHERE prev_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata) WHERE metadata IS NOT NULL;

-- RLS: webhook/audit/billing/delivery 表行级安全
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_endpoints','audit_logs','stripe_customers','subscriptions'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    IF t = 'audit_logs' THEN
      EXECUTE format($f$CREATE POLICY %1$s_tenant_isolation ON %1$s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_platform_admin', true) = 'true') WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_platform_admin', true) = 'true')$f$, t);
    ELSE
      EXECUTE format($f$CREATE POLICY %1$s_tenant_isolation ON %1$s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$f$, t);
    END IF;
  END LOOP;
END $$;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant_isolation ON webhook_deliveries FOR ALL
  USING (endpoint_id IN (SELECT id FROM webhook_endpoints WHERE org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid))
  WITH CHECK (endpoint_id IN (SELECT id FROM webhook_endpoints WHERE org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid));

-- 战术配置持久化 (P1-1)
CREATE TABLE IF NOT EXISTS tactical_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100), description TEXT CHECK (char_length(description) <= 500), config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT tactical_configs_tenant_name_unique UNIQUE (tenant_id, name)
);
CREATE INDEX tactical_configs_tenant_id_idx ON tactical_configs (tenant_id);
CREATE INDEX tactical_configs_user_id_idx ON tactical_configs (user_id);
CREATE INDEX tactical_configs_updated_at_idx ON tactical_configs (updated_at DESC);
ALTER TABLE tactical_configs ENABLE ROW LEVEL SECURITY; ALTER TABLE tactical_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tactical_configs_tenant_isolation ON tactical_configs FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- Announcements (P3-2)
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title VARCHAR(200) NOT NULL, body TEXT NOT NULL, category VARCHAR(50) NOT NULL DEFAULT 'general',
  severity VARCHAR(20) NOT NULL DEFAULT 'info', published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fk_announcements_created_by ON announcements (created_by);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY; ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
CREATE POLICY announcements_public_read ON announcements FOR SELECT USING (true);
CREATE POLICY announcements_admin_write ON announcements FOR INSERT WITH CHECK (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
CREATE POLICY announcements_admin_update ON announcements FOR UPDATE USING (COALESCE(current_setting('app.current_user_role', true), '') = 'admin') WITH CHECK (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
CREATE POLICY announcements_admin_delete ON announcements FOR DELETE USING (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');

-- 自定义 Tickers (用户上传 CSV, per-user RLS 隔离)
CREATE TABLE IF NOT EXISTS custom_tickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, ticker VARCHAR(20) NOT NULL,
  name VARCHAR(200), data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, ticker)
);
ALTER TABLE custom_tickers ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE op TEXT;
BEGIN
  FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF op = 'INSERT' THEN
      EXECUTE $f$CREATE POLICY custom_tickers_user_$f$ || lower(op) || $f$ ON custom_tickers FOR $f$ || op || $f$ WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID)$f$;
    ELSE
      EXECUTE $f$CREATE POLICY custom_tickers_user_$f$ || lower(op) || $f$ ON custom_tickers FOR $f$ || op || $f$ USING (user_id = current_setting('app.current_user_id', true)::UUID)$f$;
      IF op = 'UPDATE' THEN
        EXECUTE $f$ALTER POLICY custom_tickers_user_update ON custom_tickers USING (user_id = current_setting('app.current_user_id', true)::UUID) WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID)$f$;
      END IF;
    END IF;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS idx_custom_tickers_user ON custom_tickers(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_tickers_ticker ON custom_tickers(ticker);

-- FORCE RLS 补齐 (024 仅 ENABLE 未 FORCE 的表)
DO $$ DECLARE tbl_name TEXT;
BEGIN
  FOR tbl_name IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true AND c.relforcerowsecurity = false
  LOOP EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl_name); END LOOP;
END $$;

-- org_memberships + api_keys/invitations RLS (C-002: 认证中间件按 key_hash/token_hash 查询需在 GUC 注入前放行)
CREATE TABLE IF NOT EXISTS org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys','invitations','org_memberships'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY; ALTER TABLE %s FORCE ROW LEVEL SECURITY', t, t);
    IF t = 'org_memberships' THEN
      EXECUTE format($f$CREATE POLICY %1$s_tenant_isolation ON %1$s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$f$, t);
    ELSE
      EXECUTE format($f$CREATE POLICY %1$s_tenant_isolation ON %1$s FOR ALL USING (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL) WITH CHECK (org_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)$f$, t);
    END IF;
  END LOOP;
END $$;

-- updated_at 触发器
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','tickers','organizations','portfolios','saved_configs','subscriptions','stripe_customers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$s; CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION trg_webhook_endpoints_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS set_webhook_endpoints_updated_at ON webhook_endpoints;
CREATE TRIGGER set_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints FOR EACH ROW EXECUTE FUNCTION trg_webhook_endpoints_updated_at();
CREATE OR REPLACE FUNCTION trg_tactical_configs_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER set_tactical_configs_updated_at BEFORE UPDATE ON tactical_configs FOR EACH ROW EXECUTE FUNCTION trg_tactical_configs_updated_at();
