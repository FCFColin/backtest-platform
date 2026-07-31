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
