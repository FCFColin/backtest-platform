-- Consolidated rollback (rebaselined 2026-08-01)
-- 汇总迁移回滚：DROP 全部表与 schema_migrations（回滚后系统视为未初始化，重新执行 001 即全新初始化）。
-- ⚠️ 数据丢失警告：此回滚会永久删除全部业务数据，仅在备份后或新环境执行。
DROP TABLE IF EXISTS prices, tickers, cpi_data, exchange_rates, users, organizations,
  memberships, user_roles, roles, role_permissions, portfolios, saved_configs,
  backtest_runs, outbox, api_keys, schema_migrations, email_verification_tokens, invitations,
  subscriptions, stripe_customers, webhook_endpoints, webhook_deliveries, audit_logs,
  login_events, password_history, announcements, tactical_configs, usage_events, usage_counters,
  custom_tickers, org_memberships CASCADE;
