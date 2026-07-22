-- =============================================================================
-- 迁移 v15：新增 tickers.exchange 列
-- 描述：存储标的所属交易所代码（SZSE/SSE/US 等），用于按交易所分布统计。
--       修复数据引擎页"按交易所分布"全部显示为"未知"的 bug（Task 4.1）。
-- =============================================================================
-- 企业理由：原 updateMarketStats 硬编码 byExchange[''] 空键，导致所有标的
-- 都落入"未知"桶。新增 exchange 列后，data-fetcher 抓取时按 ticker 后缀推导
-- （_SZ/.SZ→SZSE，_SS/.SS/_SH/.SH→SSE，无后缀→US），backfill 脚本回填历史数据。
-- 权衡：增加一列存储与索引开销，但解除"未知"桶阻塞，使分布统计可用。
-- 注意：文件编号从 spec 原计划的 002 调整为 015，因 002_fts.sql 已存在。

ALTER TABLE tickers ADD COLUMN IF NOT EXISTS exchange VARCHAR(20) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_tickers_exchange ON tickers(exchange);
