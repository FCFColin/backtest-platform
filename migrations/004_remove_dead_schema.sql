-- 004: 退役死 schema（ADR-012）
-- *_numeric 列仅由 data-fetcher 写入、无任何读取方；org_memberships 零生产消费者（后端用 memberships）；
-- idx_ff_factors_date 与 fama_french_factors(date) 主键索引重复；prices_monthly 缺 backtest_app SELECT 授权。

DROP INDEX IF EXISTS idx_prices_ticker_close_numeric;
ALTER TABLE prices DROP COLUMN IF EXISTS open_numeric, DROP COLUMN IF EXISTS high_numeric,
  DROP COLUMN IF EXISTS low_numeric, DROP COLUMN IF EXISTS close_numeric,
  DROP COLUMN IF EXISTS adjusted_close_numeric;

DROP TABLE IF EXISTS org_memberships;
DROP INDEX IF EXISTS idx_ff_factors_date;

GRANT SELECT ON prices_monthly TO backtest_app;
