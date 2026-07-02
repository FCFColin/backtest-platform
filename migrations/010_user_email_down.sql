-- 010 回滚：移除自助注册与邀请相关 schema（ADR-035）
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS email_verification_tokens;
DROP INDEX IF EXISTS idx_users_email_unique;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
ALTER TABLE users DROP COLUMN IF EXISTS email;
