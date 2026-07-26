-- =============================================================================
-- 迁移 v22：不可篡改审计存储（P2-03）— 持久化审计日志表
-- 描述：独立于 outbox 的持久化审计存储，HMAC 签名防篡改，定期导出至 MinIO WORM
-- =============================================================================
-- 企业理由：
--   outbox 表是事件投递的临时队列（processed_at 后即视为已消费），不适合长期
--   保留审计记录。等保三级 8.1.4 要求审计日志保留 ≥180 天且不可篡改，需独立
--   持久化表存储全量审计明细，并通过 HMAC-SHA256 签名实现篡改检测（tamper-evidence）。
--   定期导出至 MinIO Object Lock COMPLIANCE 模式（WORM）后，即便 DBA 也无法删除
--   已写入的对象，满足合规审计的不可篡改要求。
--
-- 权衡：
--   - user_id / org_id 不加外键约束：审计日志必须比用户/组织存活更久，
--     用户或组织删除后审计记录仍需可查（合规追溯），FK ON DELETE CASCADE 会
--     导致审计记录被连带删除，违反不可篡改原则。改为应用层校验归属。
--   - hmac_signature 在写入时计算并固定存储，后续 verifyAuditIntegrity 重算
--     并比对——payload 被篡改时签名不匹配即可检出。HMAC 密钥（AUDIT_HMAC_KEY）
--     由 KMS/Secret Manager 管理，DBA 无法伪造签名。
--   - object_key / exported_at 为可空字段：写入时未导出（NULL），导出至 MinIO
--     后回填对象键与时间戳，便于按对象追溯。
--   - 部分索引 idx_audit_logs_unexported（WHERE exported_at IS NULL）加速
--     导出作业扫描，避免全表扫描未导出记录。
-- =============================================================================

-- 1) 持久化审计日志表（独立于 outbox 临时队列）
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  user_id UUID,
  org_id UUID,
  ip_address INET,
  action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'READ', 'EXPORT', 'CONFIG')),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  payload JSONB NOT NULL,
  hmac_signature TEXT NOT NULL,
  object_key TEXT,
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 按时间倒序查询审计日志（管理后台分页浏览）
CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at DESC);

-- 按组织 + 时间倒序查询（租户内审计追溯）
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON audit_logs(org_id, created_at DESC);

-- 导出作业扫描未导出记录（部分索引，仅扫描 exported_at IS NULL 的行）
CREATE INDEX IF NOT EXISTS idx_audit_logs_unexported
  ON audit_logs(exported_at) WHERE exported_at IS NULL;

-- 2) 授予运行角色 DML 权限（与 009_tenancy.sql / 021_webhooks.sql 同模式）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO backtest_app;
  END IF;
END
$$;
