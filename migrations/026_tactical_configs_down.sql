-- P1-1: 战术配置持久化 — 回滚迁移

DROP TRIGGER IF EXISTS tactical_configs_updated_at ON tactical_configs;
DROP POLICY IF EXISTS tactical_configs_tenant_isolation ON tactical_configs;
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS tactical_configs;
