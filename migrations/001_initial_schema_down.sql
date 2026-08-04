-- Consolidated rollback (rebaselined)
-- 汇总迁移回滚：DROP 所有表，重新执行 001_initial_schema.sql 恢复。
-- ⚠️ 数据丢失警告：此回滚会永久删除全部业务数据，仅在备份后或新环境执行。
DROP TABLE IF EXISTS prices, tickers, cpi_data, exchange_rates, users, organizations,
  memberships, org_members, user_roles, roles, role_permissions, portfolios, saved_configs,
  backtest_runs, outbox, api_keys, schema_migrations, email_verification_tokens, invitations,
  subscriptions, stripe_customers, webhook_endpoints, webhook_deliveries, audit_logs,
  login_events, password_history, announcements, tactical_configs, usage_events, usage_counters,
  custom_tickers, org_memberships CASCADE;
