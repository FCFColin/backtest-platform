-- nightly e2e/contract 与 testcontainers 共用的隔离测试库（同名约定）。
-- 迁移由超管 backtest 先执行（least-privilege：应用角色仅 DML，见 02-least-privilege.sql）。
CREATE DATABASE backtest_test OWNER backtest;
