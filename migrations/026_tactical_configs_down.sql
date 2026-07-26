-- P1-1: 战术配置持久化 — 回滚迁移

DROP TRIGGER IF EXISTS tactical_configs_updated_at ON tactical_configs;
DROP POLICY IF EXISTS tactical_configs_tenant_isolation ON tactical_configs;
DROP TABLE IF EXISTS tactical_configs;
