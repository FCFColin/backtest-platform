-- 006: 审计落库幂等（ADR-005 consumer idempotency）
-- outbox 至少一次投递（崩溃窗口 / Kafka 再均衡会重复分发），audit_logs 以 outbox 行 id 去重。
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS outbox_event_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_outbox_event
  ON audit_logs (outbox_event_id) WHERE outbox_event_id IS NOT NULL;
