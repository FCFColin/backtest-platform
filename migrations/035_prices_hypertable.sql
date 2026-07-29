-- =============================================================================
-- 迁移 v35：prices 表 hypertable 幂等校验（P2-2 / D8-H1）
-- 描述：prices 表 TimescaleDB hypertable 转换 — 幂等安全网
-- =============================================================================
-- 企业理由（D8-H1）：审计报告指出 prices 表 2.4GB 未转 hypertable。经核查，
-- 018_timescaledb.sql 已完成 hypertable 转换（chunk_time_interval = 3 months，
-- migrate_data => true，含列压缩与月线 CAGG）。本迁移作为幂等安全网：
--   - 若 018 已应用（绝大多数环境）：create_hypertable(if_not_exists=>true) 为 no-op
--   - 若 018 未应用（异常环境）：本迁移兜底完成转换
--
-- chunk_time_interval 取值说明：
--   审计建议 1 day 间隔对日线金融数据不合适——30 年数据将产生 ~7500 个微 chunk，
--   元数据开销过大且分区裁剪收益微弱。TimescaleDB 官方建议每 chunk 约占内存预算
--   25%，日线数据推荐 1~3 个月（约 63~126 交易日每 chunk）。本迁移沿用 018 的
--   3 months 以保持一致，避免 chunk 粒度漂移。注意：if_not_exists=>true 时，已存在
--   的 hypertable 的 chunk_time_interval 不会被修改，故此处参数仅对未转换环境生效。
-- =============================================================================

-- 1. 确保 TimescaleDB 扩展存在（与 018 一致，幂等）
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. 修正主键：hypertable 要求所有唯一索引包含分区列 date
--    （018 已执行此步；IF EXISTS 保证幂等，即便 018 已删过约束也不报错）
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_pkey;

-- 3. 转换为 hypertable（幂等：已转换时 if_not_exists=>true 返回 notice 并跳过）
--    chunk_time_interval 与 018 保持一致（3 months），避免同一表出现不一致的
--    chunk 粒度。migrate_data=>true 仅在表非空且尚未 hypertable 时生效。
SELECT create_hypertable(
  'prices',
  'date',
  chunk_time_interval => INTERVAL '3 months',
  migrate_data => TRUE,
  if_not_exists => TRUE
);

-- 4. 校验：确认 prices 已是 hypertable（仅日志，不阻断）
DO $$
DECLARE
  is_hypertable BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'prices'
  ) INTO is_hypertable;
  IF is_hypertable THEN
    RAISE NOTICE 'prices 已是 hypertable，035 为幂等 no-op';
  ELSE
    RAISE WARNING 'prices 仍未转换为 hypertable，请检查 TimescaleDB 扩展与权限';
  END IF;
END $$;