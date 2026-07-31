-- 012 回滚：移除用量计量与配额表（ADR-037）
-- ⚠️ 数据丢失警告：此回滚包含 DROP TABLE，会永久删除业务数据，不可恢复。仅在备份后或新环境执行。
DROP TABLE IF EXISTS usage_counters;
DROP TABLE IF EXISTS usage_events;
