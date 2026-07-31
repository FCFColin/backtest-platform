-- =============================================================================
-- 回滚迁移 v20：可配置 RBAC（P2-01）— 删除自定义角色相关表与列
-- 描述：回滚 v20，删除 roles/role_permissions/user_roles 表与 portfolios.visible_to_roles 列
-- =============================================================================

ALTER TABLE portfolios DROP COLUMN IF EXISTS visible_to_roles;

-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
