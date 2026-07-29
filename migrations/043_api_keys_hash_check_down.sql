-- 回滚 v43：恢复 key_hash NOT NULL（仅在所有行都有 key_hash 时安全）
-- 注意：如果已有仅含 key_hash_argon2 的行，回滚会失败
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_hash_present;
-- 不恢复 NOT NULL：已有 argon2-only 密钥会导致失败
-- ALTER TABLE api_keys ALTER COLUMN key_hash SET NOT NULL;