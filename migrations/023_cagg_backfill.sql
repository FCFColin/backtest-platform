-- 描述：CAGG 回填 + 刷新策略调整（P1-01 TimescaleDB 迁移完成）
-- =============================================================================
-- 迁移 v23：prices_monthly CAGG 历史数据回填 + 刷新策略优化
-- =============================================================================
-- 企业理由（P1-01）：迁移 018 创建 prices_monthly CAGG 时使用 WITH NO DATA，
-- 历史月线数据未物化，导致月度粒度查询回退到原始 prices hypertable 全扫。
-- 本迁移：
-- 1. 分批回填 CAGG 历史数据（每月一批，避免单事务内存压力）
-- 2. 调整 CAGG 刷新策略：end_offset 从 1 hour → 2 days，容忍 late-arriving 数据
--    （data-fetcher 补抓最多延迟 24h，end_offset ≥ 2 days 确保延迟数据被聚合）
-- 3. start_offset 从 1 month → 3 months，覆盖更长的修正窗口
-- 4. schedule_interval 从 1 hour → 1 day，减少无效刷新（日线数据每日收盘后确定）
--
-- 参考：TimescaleDB 2.18+ refresh_continuous_aggregate 支持分批回填
-- 幂等性：refresh_continuous_aggregate 可重复调用，已刷新的区间为 no-op
-- =============================================================================
BEGIN;

-- 1. 分批回填 CAGG 历史数据（从 2000-01-01 到当前月，每月一批）
--    使用 DO 块 + 循环避免单事务过大（3780 万行 → 378 个月 × ~10万行/月）
DO $$
DECLARE
  v_start DATE := '2000-01-01';
  v_end   DATE := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  v_cur   DATE := v_start;
  v_batch_count INTEGER := 0;
BEGIN
  -- 检查 prices_monthly 是否存在
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.continuous_aggregates
    WHERE view_name = 'prices_monthly'
  ) THEN
    RAISE NOTICE 'prices_monthly CAGG does not exist, skipping backfill';
    RETURN;
  END IF;

  WHILE v_cur < v_end LOOP
    -- refresh_continuous_aggregate 使用排他区间 [start, end)
    -- 每次刷新一个月的数据
    PERFORM refresh_continuous_aggregate(
      'prices_monthly',
      v_cur::TIMESTAMPTZ,
      (v_cur + INTERVAL '1 month')::TIMESTAMPTZ
    );
    v_cur := (v_cur + INTERVAL '1 month')::DATE;
    v_batch_count := v_batch_count + 1;

    -- 每 12 个月输出一次进度
    IF v_batch_count % 12 = 0 THEN
      RAISE NOTICE 'CAGG backfill progress: % batches completed (current: %)', v_batch_count, v_cur;
    END IF;
  END LOOP;

  RAISE NOTICE 'CAGG backfill completed: % batches total', v_batch_count;
END $$;

-- 2. 移除旧的 CAGG 刷新策略（start_offset=1month, end_offset=1hour, schedule=1hour）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
      AND hypertable_name = 'prices_monthly'
  ) THEN
    PERFORM remove_continuous_aggregate_policy('prices_monthly');
    RAISE NOTICE 'Removed old CAGG refresh policy';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Old CAGG policy removal skipped: %', SQLERRM;
END $$;

-- 3. 添加新的 CAGG 刷新策略
--    start_offset=3months：刷新最近 3 个月数据（覆盖 late-arriving 修正）
--    end_offset=2days：截止 2 天前（容忍 data-fetcher 24h 延迟补抓）
--    schedule_interval=1day：每日刷新一次（日线数据收盘后确定，无需更频繁）
SELECT add_continuous_aggregate_policy(
  'prices_monthly',
  start_offset => INTERVAL '3 months',
  end_offset   => INTERVAL '2 days',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

COMMIT;
