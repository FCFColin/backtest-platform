-- =============================================================================
-- 迁移 v17：ADMIN_API_KEY 安全加固 — 平台密钥移入 DB + 生命周期 + argon2id
-- 描述：ADMIN_API_KEY 静态凭证加固（P0-04）：移入 api_keys 表（is_platform_admin=true, org_id=NULL），
--       新增 expires_at（最大 90 天）与 key_hash_argon2（argon2id）列，支持轮换与吊销。
-- =============================================================================
-- 企业理由：单一静态 ADMIN_API_KEY 不可吊销、不可审计、违背等保三级"身份鉴别"
-- 与"访问控制"控制点。将其移入 api_keys 表后，可按密钥记录轮换、吊销、
-- 限期、记录最后使用时间，与按组织密钥共用同一治理面。
-- 权衡：org_id 由 NOT NULL 改为可空（平台密钥不绑定租户），需以 CHECK 约束
-- 收敛为"平台密钥 org_id 为 NULL，租户密钥 org_id NOT NULL"，避免出现
-- 既无租户又非平台的孤儿记录。argon2id 与既有 sha256(key_hash) 共存以渐进迁移：
-- 新密钥写入 key_hash_argon2，旧密钥仍按 key_hash 等值查找直至轮换。

-- 1) 平台管理员标记（运营 SaaS 自身的 break-glass 密钥，org_id 为 NULL）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) 有效期（NULL=不限；平台 break-glass 密钥应用层强制 <=90 天）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3) argon2id 编码哈希（新密钥使用；与 key_hash 共存，verify 时优先 argon2id）
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash_argon2 TEXT;

-- 4) 平台 break-glass 密钥的 org_id 为 NULL（不绑定租户）
ALTER TABLE api_keys ALTER COLUMN org_id DROP NOT NULL;

-- 5) 约束：要么平台密钥（org_id NULL），要么租户密钥（org_id NOT NULL）
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_org_or_platform;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_org_or_platform CHECK (
  (is_platform_admin = TRUE AND org_id IS NULL)
  OR
  (is_platform_admin = FALSE AND org_id IS NOT NULL)
);

-- 6) expires_at 上限 90 天（写时校验，防止签发超长有效期密钥）
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_expires_max_90d;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_expires_max_90d CHECK (
  expires_at IS NULL OR expires_at <= NOW() + INTERVAL '90 days'
);

-- 7) 索引：平台密钥定位、有效期扫描
CREATE INDEX IF NOT EXISTS idx_api_keys_platform_admin
  ON api_keys(is_platform_admin) WHERE is_platform_admin = TRUE;
CREATE INDEX IF NOT EXISTS idx_api_keys_expires
  ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
