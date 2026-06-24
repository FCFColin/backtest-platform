-- =============================================================================
-- 迁移 v1：初始 schema
-- 描述：tickers, prices, cpi_data, exchange_rates, schema_migrations
-- =============================================================================
-- 企业理由：独立 SQL 文件便于 DBA 审查（I-3）。
-- 内联 SQL 无法 git diff，DBA 无法逐文件审批。
-- 权衡：需维护文件与代码的同步，但版本控制 diff 和 CI 测试收益更大。

CREATE TABLE IF NOT EXISTS tickers (
  ticker VARCHAR(20) PRIMARY KEY,
  category VARCHAR(50) NOT NULL DEFAULT '',
  market VARCHAR(20) NOT NULL DEFAULT '',
  search_vector tsvector,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prices (
  id BIGSERIAL PRIMARY KEY,
  ticker VARCHAR(20) NOT NULL REFERENCES tickers(ticker),
  date DATE NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  volume BIGINT,
  adjusted_close DOUBLE PRECISION,
  UNIQUE(ticker, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker ON prices(ticker);
CREATE INDEX IF NOT EXISTS idx_prices_ticker_date ON prices(ticker, date);
CREATE INDEX IF NOT EXISTS idx_prices_date_brin ON prices USING BRIN(date);

CREATE TABLE IF NOT EXISTS cpi_data (
  country VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (country, date)
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  base_currency VARCHAR(10) NOT NULL,
  target_currency VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (base_currency, target_currency, date)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT
);
