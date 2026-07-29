-- =============================================================================
-- migration v44: user_roles.role_id FK index (D8-H6 补充)
-- 描述：user_roles 的 PK 是 (user_id, role_id)，role_id 不是最左列，
-- 缺少 role_id 索引导致 roles ON DELETE CASCADE 时全表扫描。
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_fk_user_roles_role_id
  ON user_roles (role_id);
