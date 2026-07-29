-- =============================================================================
-- 迁移 v21：Webhook 系统（P2-02）— 端点配置 + 投递历史
-- 描述：Webhook 端点配置表与投递历史表，支持事件订阅、HMAC 签名、重试与自动禁用
-- =============================================================================
-- 企业理由：
--   平台事件（如 BacktestCompleted）需主动推送到用户配置的 HTTPS 端点，
--   使客户集成（CI/CD、Slack 通知、数据同步）无需轮询。Outbox 模式保证事件不丢；
--   Webhook 投递表保证最终一致性与可观测性（投递状态、重试、自动禁用）。
--
-- 权衡：
--   - webhook_endpoints 使用 org_id 而非 tenant_id（与 api_keys 对齐），
--     024_rls_extension.sql 已为本表补启用 RLS（修复 GUC 名后），单租户查询
--     通过 current_setting('app.current_tenant_id') 隔离；后台重试作业以
--     SECURITY DEFINER 函数或独立连接跳过 RLS。
--   - webhook_deliveries 每端点保留最近 100 条（应用层 cleanupOldDeliveries 清理），
--     避免长期累积；超出部分按 created_at DESC 删除最旧。
--   - 失败连续 5 次自动禁用端点（is_active=FALSE, disabled_at=NOW()），
--     防止持续打死的端点拖垮重试作业。
--   - URL HTTPS 校验由应用层 zod schema 完成（DB 层不加 CHECK，便于本地 http 调试时
--     临时放宽；生产校验在路由层）。
--   - secret 列为 bytea（AES-256-GCM 密文），配套 secret_iv/secret_tag/
--     secret_kid 存储加密元数据。主密钥由 WEBHOOK_SECRET_KEK 环境变量提供。
--     应用层（webhookService.ts）在 INSERT 前 encrypt()、在签名前 decrypt()。
--     DB 层不接触明文密钥，即使 DB 泄露攻击者也无法伪造事件签名。
-- =============================================================================

-- 0) pgcrypto 扩展（提供加解密函数，应用层调用 pgp_sym_encrypt/decrypt）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Webhook 端点配置表
--    secret 列存储 AES 加密密文（base64），由 webhookService.ts 加解密
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret BYTEA NOT NULL,
  secret_iv BYTEA,
  secret_tag BYTEA,
  secret_kid TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  subscribed_events TEXT[] NOT NULL DEFAULT '{}',
  failed_consecutive_count INTEGER NOT NULL DEFAULT 0,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON webhook_endpoints(org_id);
-- 活跃端点查询索引（triggerWebhooks 按 org_id + is_active + subscribed_events 过滤）
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active
  ON webhook_endpoints(org_id) WHERE is_active = TRUE;

-- 2) Webhook 投递历史表（每端点保留最近 100 条，由 cleanupOldDeliveries 收敛）
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending','success','failed','retrying')),
  response_code INTEGER,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 投递历史查询（按端点倒序分页）
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_created
  ON webhook_deliveries(endpoint_id, created_at DESC);
-- 重试作业扫描索引：仅扫描待重试投递（pending/retrying 且到点）
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries(next_retry_at) WHERE status IN ('pending','retrying');

-- 3) updated_at 触发器（与 users 表 004_users.sql 同模式）
CREATE OR REPLACE FUNCTION trg_webhook_endpoints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_webhook_endpoints_updated_at ON webhook_endpoints;
CREATE TRIGGER set_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION trg_webhook_endpoints_updated_at();

-- 4) 授予运行角色 DML 权限（与 009_tenancy.sql 同模式，兼容既有角色）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_endpoints, webhook_deliveries TO backtest_app;
  END IF;
END
$$;
