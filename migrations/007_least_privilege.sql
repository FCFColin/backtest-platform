-- T-21 / 维度8：数据库最小权限角色（least privilege）
--
-- 企业为何需要：应用以拥有 DDL/DROP 权限的库主用户连接时，一旦发生 SQL 注入或凭证泄露，
-- 攻击者即可 DROP TABLE / 篡改结构 / 越权读取所有库。最小权限原则要求运行期账户仅持有
-- 业务所需的 DML 权限（SELECT/INSERT/UPDATE/DELETE），DDL 由独立的迁移账户执行。
--
-- 使用方式（由 DBA / 迁移流程以管理员身份执行一次）：
--   1. 设置应用角色密码：\set app_password '强随机密码'
--   2. 执行本脚本；
--   3. 将应用 DATABASE_URL 切换为 backtest_app 角色（而非库主用户）。
--
-- 权衡：引入双角色（迁移账户 + 运行账户）增加少量运维步骤，但显著缩小攻击爆炸半径。
-- 注意：本脚本使用 IF NOT EXISTS 思路，幂等可重入；角色密码请通过环境注入，勿硬编码。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backtest_app') THEN
    -- 占位密码：生产部署时务必以 ALTER ROLE 重设为强随机密码并通过密钥管理注入。
    CREATE ROLE backtest_app LOGIN PASSWORD 'change-me-in-deploy';
  END IF;
END
$$;

-- 连接与 schema 使用权限（使用 current_database() 避免硬编码库名，便于 testcontainers/多环境）
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO backtest_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO backtest_app;

-- 仅授予现有表的 DML 权限（不含 DDL/TRUNCATE/DROP）
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO backtest_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO backtest_app;

-- 对未来由迁移账户创建的表/序列，自动继承相同 DML 权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO backtest_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO backtest_app;

-- 显式回收危险默认权限（PUBLIC 对 public schema 的 CREATE）
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
