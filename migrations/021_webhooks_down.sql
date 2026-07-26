-- =============================================================================
-- 回滚迁移 v21：Webhook 系统（P2-02）— 删除端点配置与投递历史表
-- 描述：回滚 v21，删除 webhook_endpoints 与 webhook_deliveries 表及触发器
-- =============================================================================

DROP TRIGGER IF EXISTS set_webhook_endpoints_updated_at ON webhook_endpoints;
DROP FUNCTION IF EXISTS trg_webhook_endpoints_updated_at();

DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
