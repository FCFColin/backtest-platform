-- =============================================================================
-- 迁移 v18 回滚：TimescaleDB 时序优化（P1-02）
-- =============================================================================
-- 注意：TimescaleDB hypertable 转换不完全可逆。本回滚脚本：
-- 1. 删除 Continuous Aggregate（prices_monthly）
-- 2. 移除压缩策略
-- 3. 删除 CAGG 刷新策略
-- 4. 保留 hypertable 结构（转回普通表需导出数据、重建表、导入，超出迁移范围）
-- 5. 恢复 prices_pkey 主键约束（id BIGSERIAL）
--
-- 企业理由：生产环境不建议回滚 TimescaleDB 迁移；如确需回退，
-- 应通过 PITR（WAL-G 备份恢复）回到迁移前状态，而非执行此脚本。
-- =============================================================================

-- 1. 删除 CAGG 刷新策略
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_refresh_continuous_aggregate'
      AND hypertable_name = 'prices_monthly'
  ) THEN
    PERFORM remove_continuous_aggregate_policy('prices_monthly');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. 删除 Continuous Aggregate
DROP MATERIALIZED VIEW IF EXISTS prices_monthly;

-- 3. 移除压缩策略
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM timescaledb_information.jobs
    WHERE proc_name = 'policy_compression'
      AND hypertable_name = 'prices'
  ) THEN
    PERFORM remove_compression_policy('prices');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. 解除压缩设置（已压缩的 chunk 保持压缩状态，需手动 decompress）
ALTER TABLE prices SET (
  timescaledb.compress = false
);

-- 5. 恢复原始主键约束（id 列）
-- 注意：hypertable 转换时删除了 prices_pkey(id)，
-- 此处恢复主键。如 hypertable 仍存在，此约束需包含 date 列。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prices_pkey'
  ) THEN
    -- 如果仍是 hypertable，主键必须包含分区列 date
    IF EXISTS (
      SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'prices'
    ) THEN
      ALTER TABLE prices ADD CONSTRAINT prices_pkey PRIMARY KEY (id, date);
    ELSE
      ALTER TABLE prices ADD CONSTRAINT prices_pkey PRIMARY KEY (id);
    END IF;
  END IF;
END $$;

-- 注：不卸载 timescaledb 扩展（其他表可能依赖），不将 hypertable 转回普通表。
-- 完整回退需通过数据库备份恢复（WAL-G PITR）。
