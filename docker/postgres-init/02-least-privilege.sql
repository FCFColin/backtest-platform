-- T-21b：开发环境自动创建最小权限角色（docker-entrypoint-initdb.d）
-- 生产部署请使用 migrations/007_least_privilege.sql 并替换为强随机密码。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    CREATE ROLE backtest_app LOGIN PASSWORD 'backtest_app_dev';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE backtest TO backtest_app;
GRANT USAGE ON SCHEMA public TO backtest_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO backtest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO backtest_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
