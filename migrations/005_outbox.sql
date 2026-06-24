-- Architecture: Outbox表，保证事件与业务数据的事务一致性
-- 企业为何需要：直接发送事件可能在业务数据写入后、事件发送前崩溃，导致数据不一致
-- 权衡：Outbox增加写入开销（双写），但保证最终一致性

CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  CONSTRAINT chk_processed_after_created CHECK (processed_at IS NULL OR processed_at >= created_at)
);

CREATE INDEX idx_outbox_unprocessed ON outbox (created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_outbox_aggregate ON outbox (aggregate_type, aggregate_id);
