-- 回滚 ADR-024 / T-11 Outbox 去重强化
DROP INDEX IF EXISTS uq_outbox_event_id;
ALTER TABLE outbox DROP COLUMN IF EXISTS event_id;
