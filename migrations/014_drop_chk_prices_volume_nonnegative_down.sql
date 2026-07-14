-- =============================================================================
-- 回滚 v14：恢复 CHECK 约束 chk_prices_volume_nonnegative
-- =============================================================================

-- 恢复冗余约束（回滚用，生产环境不建议保留——prices_ohlc_check 已等价覆盖）
ALTER TABLE prices
  ADD CONSTRAINT chk_prices_volume_nonnegative CHECK (volume IS NULL OR volume >= 0);
