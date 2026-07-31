-- =============================================================================
-- 回滚迁移 v21：Webhook 系统（P2-02）— 删除端点配置与投递历史表
-- 描述：回滚 v21，删除 webhook_endpoints 与 webhook_deliveries 表及触发器
-- =============================================================================

DROP TRIGGER IF EXISTS set_webhook_endpoints_updated_at ON webhook_endpoints;
DROP FUNCTION IF EXISTS trg_webhook_endpoints_updated_at();

-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhook_endpoints;
