-- =============================================================================
-- 回滚迁移 v31：解除 FORCE ROW LEVEL SECURITY（C-002）
-- 描述：回滚 v31，对相关表取消 FORCE（保留 ENABLE 状态）
-- =============================================================================

ALTER TABLE audit_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE custom_tickers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints NO FORCE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries NO FORCE ROW LEVEL SECURITY;
