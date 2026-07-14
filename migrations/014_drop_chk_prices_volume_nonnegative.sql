-- =============================================================================
-- 迁移 v14：删除冗余 CHECK 约束 chk_prices_volume_nonnegative
-- 描述：prices.volume 的非负性已由 prices_ohlc_check（v3）中的 volume >= 0 覆盖，
--       008_checks.sql 新增的 chk_prices_volume_nonnegative 与其语义重复
-- =============================================================================

-- 企业理由：003_index_cleanup.sql 的 prices_ohlc_check CHECK 约束已包含
-- volume >= 0 条件（PostgreSQL 中 NULL >= 0 结果为 NULL，CHECK 约束视 NULL 为通过，
-- 故等价于 volume IS NULL OR volume >= 0）。008_checks.sql 新增的独立约束
-- chk_prices_volume_nonnegative 与其完全重复，增加写入校验开销且无额外保护。
-- 权衡：删除后依赖 prices_ohlc_check 覆盖 volume 非负性，语义无损。
ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_volume_nonnegative;
