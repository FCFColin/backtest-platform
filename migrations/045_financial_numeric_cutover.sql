-- =============================================================================
-- 迁移 v45：金融金额列 DOUBLE PRECISION -> NUMERIC(19,6) 原地转换
-- 描述：prices/cpi_data/exchange_rates 金额列从浮点原地转换为定点 NUMERIC(19,6)
-- =============================================================================
-- 企业理由（ADR-007）：金融金额必须用定点 NUMERIC 存储。DOUBLE PRECISION 约 15
--   位有效数字，0.1+0.2!=0.3 的浮点误差在 30 年回测复利计算中会放大到百分点级，
--   使净值/夏普比率失真。NUMERIC(19,6) 支持 13 位整数 + 6 位小数，覆盖亿级市值
--   与微价差。
--
-- 背景：039_prices_numeric.sql 已通过双写过渡新增 *_numeric 列（Go data-fetcher
--   双写维护），但原始 DOUBLE 列仍被 TS 应用层读取。本迁移将原始列原地转换为
--   NUMERIC，使所有读取路径（TS + Go）均获得定点精度，无需改动应用代码。
--   *_numeric 列保留（Go data-fetcher 仍写入），后续可在独立迁移中清理。
--
-- 范围：
--   prices: open, high, low, close, adjusted_close（5 列）
--   cpi_data: value（1 列）
--   exchange_rates: rate（1 列）
--   volume（BIGINT，非金额）不动。
--
-- 注意：prices 是 TimescaleDB hypertable（~2.4GB），ALTER COLUMN TYPE 会全表重写，
--   建议在维护窗口执行。CHECK 约束需先删除再重建。迁移 runner 包 BEGIN/COMMIT，
--   不能用 CONCURRENTLY，与 018/039 模式一致。

-- 1. 临时删除受影响列上的 CHECK 约束（ALTER TYPE 后重建）
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_ohlc_check;
ALTER TABLE prices DROP CONSTRAINT IF EXISTS chk_prices_close_positive;
ALTER TABLE cpi_data DROP CONSTRAINT IF EXISTS chk_cpi_value_positive;
ALTER TABLE exchange_rates DROP CONSTRAINT IF EXISTS chk_exchange_rate_positive;

-- 2. 原地转换 prices 金额列（DOUBLE PRECISION -> NUMERIC(19,6)）
ALTER TABLE prices ALTER COLUMN open TYPE NUMERIC(19, 6) USING open::numeric(19, 6);
ALTER TABLE prices ALTER COLUMN high TYPE NUMERIC(19, 6) USING high::numeric(19, 6);
ALTER TABLE prices ALTER COLUMN low TYPE NUMERIC(19, 6) USING low::numeric(19, 6);
ALTER TABLE prices ALTER COLUMN close TYPE NUMERIC(19, 6) USING close::numeric(19, 6);
ALTER TABLE prices ALTER COLUMN adjusted_close TYPE NUMERIC(19, 6) USING adjusted_close::numeric(19, 6);

-- 3. 原地转换 cpi_data / exchange_rates
ALTER TABLE cpi_data ALTER COLUMN value TYPE NUMERIC(19, 6) USING value::numeric(19, 6);
ALTER TABLE exchange_rates ALTER COLUMN rate TYPE NUMERIC(19, 6) USING rate::numeric(19, 6);

-- 4. 重建 CHECK 约束（与 003 prices_ohlc_check / 008 业务约束定义一致）
ALTER TABLE prices ADD CONSTRAINT prices_ohlc_check CHECK (
  high >= low
  AND low <= open
  AND low <= close
  AND high >= open
  AND high >= close
  AND volume >= 0
);

ALTER TABLE prices ADD CONSTRAINT chk_prices_close_positive
  CHECK (close IS NULL OR close > 0);

ALTER TABLE cpi_data ADD CONSTRAINT chk_cpi_value_positive CHECK (value > 0);

ALTER TABLE exchange_rates ADD CONSTRAINT chk_exchange_rate_positive CHECK (rate > 0);
