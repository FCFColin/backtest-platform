-- Migration: 028_custom_tickers
-- Custom tickers uploaded by users (per-user RLS isolation)
-- P2-6: Custom Tickers CSV Upload

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
    USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY custom_tickers_user_insert
    ON custom_tickers FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY custom_tickers_user_update
    ON custom_tickers FOR UPDATE
    USING (user_id = current_setting('app.current_user_id')::UUID)
    WITH CHECK (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY custom_tickers_user_delete
    ON custom_tickers FOR DELETE
    USING (user_id = current_setting('app.current_user_id')::UUID);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_custom_tickers_user ON custom_tickers(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_tickers_ticker ON custom_tickers(ticker);
