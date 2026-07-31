-- Migration: 030_custom_tickers (down)
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS custom_tickers;
