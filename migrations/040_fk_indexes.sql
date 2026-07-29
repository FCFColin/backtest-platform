-- =============================================================================
-- 迁移 v40：外键列索引补齐（P2-2 / D8-H6）
-- 描述：审计发现 5 个 FK 列缺索引（实测 6 个）。FK 列无索引时，父表行删除/更新
--       会触发子表全表扫描（ON DELETE CASCADE / SET NULL 的引用完整性检查），在大表上
--       造成锁等待与性能衰退。本迁移为所有缺失索引的 FK 列补建索引。
-- =============================================================================
-- 企业理由（D8-H6）：Postgres 外键不自动建索引（与 MySQL 不同）。缺失索引的 FK
--   在父表 DELETE 时，子表需 Seq Scan 定位引用行，大表（backtest_runs/portfolios）
--   上可能秒级阻塞并引发锁升级。补建索引将引用检查降为 Index Scan，消除级联删除
--   的性能尾延迟，并加速按 owner 筛选的常见查询（如"我创建的回测"列表）。
--
-- 清单（6 个 FK 列缺索引，全部指向 users(id)，ON DELETE SET NULL/CASCADE）：
--   1. api_keys.created_by              (009_tenancy)
--   2. portfolios.owner_user_id          (009_tenancy)
--   3. saved_configs.owner_user_id      (009_tenancy)
--   4. backtest_runs.owner_user_id      (009_tenancy)
--   5. announcements.created_by          (029_announcements)
--   6. invitations.invited_by            (010_user_email)
--   已检查其余 FK（prices.ticker / memberships / api_keys.org_id / *_tenant_id /
--   webhook_*.endpoint_id / tactical_configs.* / custom_tickers.user_id /
--   org_memberships.* / email_verification_tokens.user_id）均有对应索引。
-- =============================================================================

-- 1. api_keys.created_by（平台密钥溯源、按创建者筛选）
CREATE INDEX IF NOT EXISTS idx_fk_api_keys_created_by
  ON api_keys (created_by);

-- 2. portfolios.owner_user_id（"我的组合"列表、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_portfolios_owner_user_id
  ON portfolios (owner_user_id);

-- 3. saved_configs.owner_user_id（"我的配置"列表、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_saved_configs_owner_user_id
  ON saved_configs (owner_user_id);

-- 4. backtest_runs.owner_user_id（"我的回测"列表、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_backtest_runs_owner_user_id
  ON backtest_runs (owner_user_id);

-- 5. announcements.created_by（公告作者溯源、属主级联）
CREATE INDEX IF NOT EXISTS idx_fk_announcements_created_by
  ON announcements (created_by);

-- 6. invitations.invited_by（邀请发起人溯源、属主级联 SET NULL）
CREATE INDEX IF NOT EXISTS idx_fk_invitations_invited_by
  ON invitations (invited_by);