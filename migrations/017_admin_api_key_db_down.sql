-- =============================================================================
-- 回滚 v17：撤销 ADMIN_API_KEY 安全加固迁移
-- 描述：回滚平台密钥移入 DB、生命周期与 argon2id 列；删除平台密钥行后恢复 org_id NOT NULL。
-- =============================================================================
-- 注意：若已存在 is_platform_admin=TRUE 的密钥记录（org_id NULL），
-- 必须先删除这些行，否则恢复 org_id NOT NULL 约束会失败。

DELETE FROM api_keys WHERE is_platform_admin = TRUE;

DROP INDEX IF EXISTS idx_api_keys_expires;
DROP INDEX IF EXISTS idx_api_keys_platform_admin;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_expires_max_90d;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_org_or_platform;

-- 恢复 org_id NOT NULL（仅当不存在 NULL 行时成功，上面 DELETE 已保证）
ALTER TABLE api_keys ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE api_keys DROP COLUMN IF EXISTS key_hash_argon2;
ALTER TABLE api_keys DROP COLUMN IF EXISTS expires_at;
ALTER TABLE api_keys DROP COLUMN IF EXISTS is_platform_admin;
