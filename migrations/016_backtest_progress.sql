-- =============================================================================
-- 迁移 v16：回测任务进度列（P0-03 回测任务异步化）
-- 描述：为 backtest_runs 表添加 progress_pct 列，存储异步任务执行进度（0-100）。
--       BullMQ Worker 在数据加载/回测计算/结果写入各阶段调用 job.updateProgress()，
--       API 端点 GET /api/v1/backtest/runs/:jobId 透出该进度供前端轮询展示。
-- =============================================================================
-- 企业理由：异步化后客户端无法同步感知完成时间，进度百分比提升用户体验
--           （避免长时间无反馈的"黑屏等待"）。列存储在 backtest_runs 表中，
--           便于历史任务回溯与运维监控。
-- 权衡：增加一列存储与 CHECK 约束开销，但进度可见性是异步化必需的 UX 保障。

ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS progress_pct INTEGER NOT NULL DEFAULT 0;

-- 进度百分比约束：必须在 0-100 范围内，防止异常值污染前端展示。
ALTER TABLE backtest_runs ADD CONSTRAINT chk_backtest_runs_progress_pct
  CHECK (progress_pct >= 0 AND progress_pct <= 100);
