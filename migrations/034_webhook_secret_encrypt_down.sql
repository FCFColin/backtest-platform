-- =============================================================================
-- 回滚迁移 v34：恢复 secret 为明文 text，移除加密元数据列
-- 描述：回滚 v34（注意：密文无法还原为原明文，secret 置 NULL）
-- =============================================================================

ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS secret_kid;
ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS secret_tag;
ALTER TABLE webhook_endpoints DROP COLUMN IF EXISTS secret_iv;

ALTER TABLE webhook_endpoints ALTER COLUMN secret DROP NOT NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret TYPE text USING NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN secret SET NOT NULL;
