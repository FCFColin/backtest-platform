-- 描述：CAGG 回填 + 刷新策略调整（P1-01 TimescaleDB 迁移完成）
-- =============================================================================
-- 迁移 v23：prices_monthly CAGG 历史数据回填 + 刷新策略优化
-- =============================================================================
-- 企业理由（P1-01）：迁移 018 创建 prices_monthly CAGG 时使用 WITH NO DATA，
-- 历史月线数据未物化，导致月度粒度查询回退到原始 prices hypertable 全扫。
-- 本迁移调整 CAGG 刷新策略，并尝试回填历史数据。
--
-- 注意：refresh_continuous_aggregate 不能在事务中执行（TimescaleDB 限制），
-- 而 migrations.ts 的 initSchema 用 BEGIN/COMMIT 包裹每个迁移。
-- 因此回填部分使用 EXCEPTION 捕获事务冲突，仅在非事务上下文成功；
-- 实际回填由 scripts/refresh-cagg.sql 独立脚本执行（不通过 migrations.ts）。
-- =============================================================================

-- 1. 分批回填 CAGG 历史数据（从 2000-01-01 到当前月，每月一批）
--    若在事务中运行则跳过（由 scripts/refresh-cagg.sql 独立执行）
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
    -- refresh_continuous_aggregate 在 TimescaleDB 2.18+ 是 procedure，需用 CALL
    -- 不能在事务中运行；若失败则跳过回填，由独立脚本执行
    BEGIN
      CALL refresh_continuous_aggregate(
        'prices_monthly',
        v_cur,
        (v_cur + INTERVAL '1 month')::DATE
      );
      v_batch_count := v_batch_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'CAGG backfill skipped (cannot run in transaction): %', SQLERRM;
      RETURN;
    END;

    v_cur := (v_cur + INTERVAL '1 month')::DATE;

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
