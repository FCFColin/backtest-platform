-- =============================================================================
-- 迁移 v33：backtest_app 角色全表 DML 授权 + 默认权限（C-002）
-- 描述：授予 backtest_app 对所有现有及未来表的 SELECT/INSERT/UPDATE/DELETE 权限
-- =============================================================================
-- 企业理由（C-002）：应用运行时连接从超级用户 backtest 切换到最小权限角色
-- backtest_app（NOBYPASSRLS）后，需确保该角色对所有业务表有 DML 权限，否则
-- RLS 策略生效但无表权限会导致查询被拒。本迁移一次性补齐现有表授权，并通过
-- ALTER DEFAULT PRIVILEGES 覆盖未来新建表，避免每次迁移都要手动 GRANT。

GRANT USAGE ON SCHEMA public TO backtest_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO backtest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backtest_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO backtest_app;
