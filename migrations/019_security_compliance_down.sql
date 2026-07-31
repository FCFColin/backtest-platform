-- =============================================================================
-- 回滚迁移 v19：等保三级合规（P1-09）— 删除 MFA + 密码历史 + 登录审计
-- 描述：回滚 v19，删除新增表与列
-- =============================================================================

DROP VIEW IF EXISTS v_admin_users_without_mfa;
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS login_events;
DROP TABLE IF EXISTS password_history;

ALTER TABLE users DROP COLUMN IF EXISTS password_must_change;
ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_backup_codes;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_secret;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_enabled;
