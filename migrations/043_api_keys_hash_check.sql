-- =============================================================================
-- 迁移 v43：完成 api_keys 双哈希列迁移（D8-017）
-- 描述：key_hash 列改为 nullable + 添加 CHECK 约束确保至少一个哈希非空
-- =============================================================================
-- 企业理由：017_admin_api_key_db.sql 添加了 key_hash_argon2 列用于 argon2id 哈希，
-- 但 key_hash 仍为 NOT NULL，导致即使 argon2 就绪也必须双写 sha256。无 CHECK 约束
-- 确保至少一个非空。本迁移完成迁移：key_hash 改为 nullable，添加 CHECK 约束。
-- 权衡：现有数据 key_hash 均非空，CHECK 约束不会拒绝任何现有行。

ALTER TABLE api_keys ALTER COLUMN key_hash DROP NOT NULL;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_hash_present;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_hash_present
  CHECK (key_hash IS NOT NULL OR key_hash_argon2 IS NOT NULL);