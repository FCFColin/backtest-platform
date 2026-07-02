-- ADR-024 / T-11: Outbox 去重与幂等强化
--
-- 企业为何需要：原实现同一 BacktestCompleted 事件被写入两次
--   （application/backtest-service 的事务写入 + BacktestCompletedHandler 的非事务写入），
--   且 OutboxPublisher → eventDispatcher → handler → 再写 outbox → NOTIFY 形成反馈环。
-- 本迁移引入 event_id 唯一去重键，配合写入侧 ON CONFLICT DO NOTHING，
--   使重复写入（重试、双路径）成为幂等的 no-op，作为应用层修复之外的数据库级防线（纵深防御）。
-- 权衡：event_id 可空以兼容历史行；新写入应始终提供 event_id。

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS event_id UUID;

-- 唯一约束：相同 event_id 仅允许一行，重复写入被 ON CONFLICT 吞掉。
-- 使用唯一索引（而非列约束）以便对历史 NULL 行宽容（多个 NULL 不冲突）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_event_id ON outbox (event_id) WHERE event_id IS NOT NULL;
