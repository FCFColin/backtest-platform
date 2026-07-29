-- =============================================================================
-- 迁移 v39：prices 金额列 DOUBLE PRECISION -> NUMERIC(19,6) 双写过渡（P2-2 / D8-H5）
-- 描述：DOUBLE PRECISION 浮点无法精确表示十进制金额，回测累积误差影响净值。
--       本迁移采用双写过渡（dual-write）：新增 *_numeric 列并回填，旧列保留供下版切换。
-- =============================================================================
-- 企业理由（D8-H5）：金融金额必须用定点 NUMERIC 存储（ADR-007）。DOUBLE PRECISION
--   约 15 位有效数字，0.1+0.2!=0.3 的浮点误差在 30 年回测复利计算中会放大到百分点级，
--   使净值/夏普比率失真。NUMERIC(19,6) 支持 13 位整数 + 6 位小数，覆盖亿级市值与
--   微价差。双写过渡避免一次性切换的风险：新写入同时落 DOUBLE（兼容旧读取）与
--   NUMERIC（精确），下版验证后切换读取源并删除旧列。
--
-- 范围：prices 的 open/high/low/close/adjusted_close 五个金额列均迁移；
--   volume（BIGINT，非金额）与 exchange（TEXT）不动。
--   任务原文 "price_numeric"（单数）按语义解读为全部金额列。
--
-- 注意：不删除旧 DOUBLE 列（下版切换后再删）；hypertable 上 CREATE INDEX 在事务
--   内执行（迁移 runner 包 BEGIN/COMMIT），不能用 CONCURRENTLY，与 018 模式一致。
-- =============================================================================

-- 1. 新增 NUMERIC(19,6) 列（可空，避免旧写入路径失败）
ALTER TABLE prices ADD COLUMN IF NOT EXISTS open_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS high_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS low_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS close_numeric NUMERIC(19, 6);
ALTER TABLE prices ADD COLUMN IF NOT EXISTS adjusted_close_numeric NUMERIC(19, 6);

-- DDL/DML 同迁移说明 (M-009)：以下 UPDATE 为一次性数据回填（DOUBLE -> NUMERIC），
-- 与上方 ALTER TABLE ADD COLUMN 必须在同一迁移中执行。原因：新增 NUMERIC 列
-- 默认 NULL，若拆分到独立迁移，在 DDL 与回填之间读取 NUMERIC 列会得到 NULL，
-- 导致回测计算异常。回填使用 WHERE *_numeric IS NULL 保证幂等。下方索引
-- 亦依赖回填完成后的数据分布。
-- 2. 回填：从 DOUBLE 列转换（NULL 保持 NULL）
--    2.4GB hypertable 全表 UPDATE 可能耗时数分钟，建议维护窗口执行。
UPDATE prices SET
  open_numeric = open::numeric(19, 6),
  high_numeric = high::numeric(19, 6),
  low_numeric = low::numeric(19, 6),
  close_numeric = close::numeric(19, 6),
  adjusted_close_numeric = adjusted_close::numeric(19, 6)
WHERE open_numeric IS NULL
   OR high_numeric IS NULL
   OR low_numeric IS NULL
   OR close_numeric IS NULL
   OR adjusted_close_numeric IS NULL;

-- 3. 索引：close 是回测主用价，建 (ticker, close_numeric) 支持按标的价幅查询
CREATE INDEX IF NOT EXISTS idx_prices_ticker_close_numeric
  ON prices (ticker, close_numeric);