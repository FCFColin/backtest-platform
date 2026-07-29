-- =============================================================================
-- 回滚迁移 v33：撤销 backtest_app 全表授权与默认权限
-- 描述：回滚 v33
-- =============================================================================

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM backtest_app;

REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM backtest_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM backtest_app;

REVOKE USAGE ON SCHEMA public FROM backtest_app;
