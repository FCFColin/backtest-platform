-- =============================================================================
-- 迁移 v19：等保三级合规（P1-09）— MFA + 密码策略 + 登录审计
-- 描述：等保三级身份鉴别与访问控制：TOTP MFA、密码历史、登录事件审计表
-- =============================================================================
-- 企业理由（GB/T 22239 三级要求）：
--   8.1.4 身份鉴别：应对登录的用户进行身份标识和鉴别，身份标识具有唯一性，
--     身份鉴别信息具有复杂度要求并定期更换；
--   8.1.4 b) 应具有登录失败处理功能，配置并启用结束会话、限制非法登录次数
--     等选项；自动化检测异常登录行为。
--   8.1.10 审计：应启用安全审计功能，审计覆盖到每个用户，对重要的用户行为
--     和重要安全事件进行审计；审计记录保留至少 6 个月（180 天）。
--
-- 权衡：
--   - mfa_secret 以明文存储（应用层加密可选），因 TOTP 密钥泄露需物理访问 DB，
--     且 DB 已强制 TLS + 最小权限（NOBYPASSRLS）。后续可接入 KMS 加密。
--   - password_history 保留最近 5 次（配置项 PASSWORD_HISTORY_KEEP），
--     超出由应用层删除；表上无 RLS（用户身份验证前需查询）。
-- =============================================================================

-- 1) users 表扩展：MFA + 密码生命周期
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
-- TOTP 备份码（argon2id 哈希后的数组，一次性消费）
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
-- 密码上次修改时间（用于密码过期策略）
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- 首次登录或重置后强制改密
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT FALSE;

-- DDL/DML 同迁移说明 (M-009)：以下 UPDATE 为已存在用户回填 password_changed_at = created_at，
-- 与上方 ALTER TABLE ADD COLUMN 必须在同一迁移中执行。原因：新列 DEFAULT NOW() 会使
-- 已有用户的 password_changed_at 设为迁移执行时间，立即触发密码过期策略（90 天），
-- 导致全部存量用户被迫改密。回填为 created_at 保持原有密码生命周期不变。幂等：
-- 仅更新 password_changed_at = NOW() 的行（即刚由 DEFAULT 填充的行）。
-- 已存在用户回填 password_changed_at = created_at（避免立即触发密码过期）
UPDATE users SET password_changed_at = created_at WHERE password_changed_at = NOW();

-- 索引：MFA 强制角色扫描（ADMIN 强制 MFA 时快速定位未启用用户）
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled) WHERE mfa_enabled = FALSE;

-- 2) 密码历史表：禁止复用最近 N 次密码（等保 8.1.4 a)
CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_time
  ON password_history(user_id, changed_at DESC);

-- 3) 登录事件审计表：异常登录检测（等保 8.1.4 b) + 8.1.10 审计）
--    记录每次登录尝试（成功/失败），用于 IP 维度异常检测与审计追溯。
--    与 Redis 实时锁定互补：Redis 处理短期计数（5min/10次），本表保留 180 天供审计查询。
CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_events_user_time ON login_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_ip_time ON login_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at DESC);

-- 4) 审计保留策略：login_events 与 outbox 审计记录保留 180 天
--    分区表便于高效清理旧数据（DROP PARTITION 比 DELETE 快几个数量级）
--    注：outbox 表已有 created_at，保留策略由 scripts/audit-retention-cleanup.sh 执行
--    login_events 采用应用层 cron 清理（见 scripts/cleanup-login-events.sql）

-- 5) 等保合规视图：未启用 MFA 的 ADMIN 用户（安全扫描用）
CREATE OR REPLACE VIEW v_admin_users_without_mfa AS
SELECT id, username, role, email, created_at
FROM users
WHERE role = 'admin' AND is_active = true AND mfa_enabled = false;

-- 6) updated_at 触发器扩展：users 表已有 updated_at 触发器（004_users.sql），
--    新增列自动被现有触发器覆盖（触发器引用 NEW.* 通配）。
