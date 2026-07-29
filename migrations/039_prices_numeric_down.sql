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