-- 描述：回滚 CAGG 回填 + 刷新策略调整（P1-01）
-- =============================================================================
-- 迁移 v23 回滚：恢复旧的 CAGG 刷新策略
-- =============================================================================
-- 注意：CAGG 历史数据回填不可逆（已物化的数据不会自动清除）。
-- 如需清空 CAGG 数据，可执行：TRUNCATE prices_monthly;
-- 本回滚仅恢复刷新策略参数到迁移 018 的原始配置。
-- =============================================================================

-- 1. 移除新策略
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
      AND hypertable_name = 'prices_monthly'
  ) THEN
    PERFORM remove_continuous_aggregate_policy('prices_monthly');
    RAISE NOTICE 'Removed CAGG refresh policy (v23)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CAGG policy removal skipped: %', SQLERRM;
END $$;

-- 2. 恢复迁移 018 的原始策略
SELECT add_continuous_aggregate_policy(
  'prices_monthly',
  start_offset => INTERVAL '1 month',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);
