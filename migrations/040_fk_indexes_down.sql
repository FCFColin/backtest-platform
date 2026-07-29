-- =============================================================================
-- 回滚迁移 v40：移除外键列索引
-- 描述：仅删除本迁移创建的 6 个 idx_fk_* 索引；不动表结构与既有索引。
-- =============================================================================

DROP INDEX IF EXISTS idx_fk_invitations_invited_by;
DROP INDEX IF EXISTS idx_fk_announcements_created_by;
DROP INDEX IF EXISTS idx_fk_backtest_runs_owner_user_id;
DROP INDEX IF EXISTS idx_fk_saved_configs_owner_user_id;
DROP INDEX IF EXISTS idx_fk_portfolios_owner_user_id;
DROP INDEX IF EXISTS idx_fk_api_keys_created_by;