-- =============================================================================
-- 迁移 v30：自定义 Tickers（用户上传 CSV，per-user RLS 隔离）
-- 描述：用户自定义标的表，按 user_id 行级隔离
-- =============================================================================
-- 注：原 028_custom_tickers.sql 重编号为 030，避免与 028_announcements 版本号冲突。
-- 028_announcements.sql 已删除（保留 029_announcements.sql 的更完整 schema）。
-- =============================================================================

CREATE TABLE IF NOT EXISTS custom_tickers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    name VARCHAR(200),
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, ticker)
);

-- RLS: users can only access their own custom tickers
ALTER TABLE custom_tickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_tickers_user_select
    ON custom_tickers FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY custom_tickers_user_insert
    ON custom_tickers FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY custom_tickers_user_update
    ON custom_tickers FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true)::UUID)
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY custom_tickers_user_delete
    ON custom_tickers FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_custom_tickers_user ON custom_tickers(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_tickers_ticker ON custom_tickers(ticker);

-- 授予运行角色 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON custom_tickers TO backtest_app;
  END IF;
END
$$;
