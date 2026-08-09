-- 004 down: 回滚死 schema 退役（一般仅回滚演练使用，生产不降级）

ALTER TABLE prices ADD COLUMN open_numeric NUMERIC(19, 6), ADD COLUMN high_numeric NUMERIC(19, 6),
  ADD COLUMN low_numeric NUMERIC(19, 6), ADD COLUMN close_numeric NUMERIC(19, 6),
  ADD COLUMN adjusted_close_numeric NUMERIC(19, 6);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_close_numeric ON prices (ticker, close_numeric);

CREATE TABLE IF NOT EXISTS org_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_ff_factors_date ON fama_french_factors(date);

REVOKE SELECT ON prices_monthly FROM backtest_app;
