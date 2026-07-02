-- 012 回滚：移除用量计量与配额表（ADR-037）
DROP TABLE IF EXISTS usage_counters;
DROP TABLE IF EXISTS usage_events;
