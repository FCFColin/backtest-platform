-- =============================================================================
-- 迁移 v8：业务 CHECK 约束（T-I2）
-- 企业理由：非法价格/负值应在 DB 层拒绝，而非仅在应用层校验。
-- 权衡：历史脏数据可能导致迁移失败，需先清洗；新写入受约束保护。
-- =============================================================================

ALTER TABLE prices
  ADD CONSTRAINT chk_prices_close_positive CHECK (close IS NULL OR close > 0);

ALTER TABLE prices
  ADD CONSTRAINT chk_prices_volume_nonnegative CHECK (volume IS NULL OR volume >= 0);

ALTER TABLE cpi_data
  ADD CONSTRAINT chk_cpi_value_positive CHECK (value > 0);

ALTER TABLE exchange_rates
  ADD CONSTRAINT chk_exchange_rate_positive CHECK (rate > 0);
