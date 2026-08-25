-- 009: 无风险利率序列存储（U-2 Phase 1）
-- FRED DGS3MO（3 个月期国库券日频）等利率序列，供引擎按日匹配 risk-free rate。
-- series 预留多序列（DGS3MO/DGS1/…）；缺失观测不插入（FRED value="." 跳过）。
CREATE TABLE IF NOT EXISTS treasury_rates (
  series VARCHAR(16) NOT NULL,
  date DATE NOT NULL,
  rate NUMERIC(19, 8) NOT NULL,
  PRIMARY KEY (series, date)
);
