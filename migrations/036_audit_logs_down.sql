-- =============================================================================
-- 回滚迁移 v36：移除 audit_logs 新增的 user_agent / metadata 列与索引
-- 描述：仅回滚本迁移新增的列与索引；不删除表（022 拥有）、不关闭 RLS（024/031 拥有）。
-- =============================================================================

DROP INDEX IF EXISTS idx_audit_logs_metadata_gin;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_agent;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata;