-- =============================================================================
-- 迁移 v34：webhook_endpoints.secret 加密存储（C-024）
-- 描述：将 secret 列从明文 text 改为 bytea 密文，新增 secret_iv/secret_tag/secret_kid
-- =============================================================================
-- 企业理由（C-024）：021_webhooks.sql 原将签名密钥以明文 text 存储，DB 拖库即可
-- 伪造事件签名。本迁移将 secret 改为 bytea（AES-256-GCM 密文），并新增 IV/认证标签/
-- 密钥标识列，配合应用层 envelopeEncryption.encrypt/decrypt（见 webhookService.ts）。
-- 现有明文数据无法还原为有效密文，统一置 NULL 并要求重新创建端点。

-- pgcrypto 扩展（021 已创建，此处幂等保证）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) secret 列 text -> bytea（现有明文置 NULL；若有数据先临时移除 NOT NULL 约束）
ALTER TABLE webhook_endpoints ALTER COLUMN secret DROP NOT NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret TYPE bytea USING NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret SET NOT NULL;

-- 2) 新增加密元数据列（IV / 认证标签 / 密钥标识）
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_iv bytea;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_tag bytea;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_kid text;
