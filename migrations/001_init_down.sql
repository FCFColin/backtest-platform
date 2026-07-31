-- =============================================================================
-- 回滚 v1：删除初始 schema
-- =============================================================================
-- 企业理由：每个迁移必须有对应的 down 文件（I-3），
-- 生产回滚时按版本降序执行 down 文件。
-- 权衡：down 文件需手动维护与 up 文件的对称性。
-- ⚠️ 数据丢失警告：DROP TABLE 会永久删除全部业务数据（prices/tickers/cpi_data/exchange_rates），
--   仅在全新环境或确认数据已备份后执行。

DROP TABLE IF EXISTS schema_migrations;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS cpi_data;
DROP TABLE IF EXISTS prices;
DROP TABLE IF EXISTS tickers;
