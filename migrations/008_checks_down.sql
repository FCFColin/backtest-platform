-- 回滚 v8 CHECK 约束

ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_close_positive;
ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_volume_nonnegative;
ALTER TABLE cpi_data DROP CONSTRAINT IF EXISTS chk_cpi_value_positive;
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS chk_exchange_rate_positive;
