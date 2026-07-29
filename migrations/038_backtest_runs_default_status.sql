-- =============================================================================
-- 迁移 v38：backtest_runs.status 默认值改为 queued（P2-2 / D8-H4）
-- 描述：009_tenancy.sql 原默认 completed，新任务应起始 queued 等待调度
-- =============================================================================
-- 企业理由（D8-H4）：异步回测任务（ADR：BullMQ）新建时应处于 queued 等待
--   worker 拉取，completed 作为默认值会让"已落库但未执行"的任务被误判完成，
--   前端轮询立即显示完成态而结果为空。改为 queued 与任务生命周期语义一致。
--
-- 关键修正：009 原有 CHECK(status IN ('pending','running','completed','failed'))
--   不含 queued，仅改默认值会导致 INSERT 违反 CHECK。必须同时扩展 CHECK 约束。
--   保留全部历史值（pending/running/completed/failed）+ 新增 queued，避免破坏
--   既有数据与正在运行的任务状态机。
-- =============================================================================

-- 1. 扩展 status CHECK 约束以容纳 queued
--    009 未显式命名约束，Postgres 自动生成 backtest_runs_status_check。
--    用 DO 块按列名+约束类型定位并删除（兼容不同 PG 版本的自动命名），再重建。
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  WHERE nsp.nspname = 'public'
    AND cls.relname = 'backtest_runs'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%'
    AND pg_get_constraintdef(con.oid) LIKE '%pending%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE backtest_runs DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE backtest_runs
  ADD CONSTRAINT backtest_runs_status_check
  CHECK (status IN ('queued', 'pending', 'running', 'completed', 'failed'));

-- 2. 默认值改为 queued
ALTER TABLE backtest_runs ALTER COLUMN status SET DEFAULT 'queued';

-- 3. 既有 completed 任务不受影响（不回填历史数据，仅改默认值与新写入语义）