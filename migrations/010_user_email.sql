-- 010 自助注册与邀请：用户邮箱 + 邮箱验证令牌 + 组织邀请（ADR-035）
--
-- 企业理由：SaaS 自助开通要求"邮箱即账号"——注册需邮箱、需验证以防滥用，
-- 团队协作需邀请机制把新成员加入组织。本迁移补齐三块：
-- 1. users 增加 email（唯一，迁移期可空）+ email_verified_at
-- 2. email_verification_tokens：注册/重发时签发，验证后失效
-- 3. invitations：组织管理员邀请邮箱加入，持 token 接受后建立 membership
--
-- 隔离边界：这些表属身份/控制平面（与 organizations/memberships/api_keys 同类），
-- 不启用 RLS——它们在"尚未解析出租户"或"验证/邀请接受"等跨租户流程中被查询。

-- ---------------------------------------------------------------------------
-- 1. users 邮箱列
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- 邮箱大小写不敏感唯一（仅对非空生效，兼容历史无邮箱用户）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users (lower(email)) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. 邮箱验证令牌
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 仅存令牌哈希（sha256 hex），明文仅在邮件链接中出现
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verification_tokens(user_id);

-- ---------------------------------------------------------------------------
-- 3. 组织邀请
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'readonly')),
  -- 仅存 token 哈希，明文仅在邀请链接中
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(lower(email));
-- 同组织同邮箱仅允许一条待处理邀请（accepted_at IS NULL）
CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_pending
  ON invitations(org_id, lower(email)) WHERE accepted_at IS NULL;

-- 授予运行角色对新表的 DML 权限
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      email_verification_tokens, invitations
      TO backtest_app;
  END IF;
END
$$;
