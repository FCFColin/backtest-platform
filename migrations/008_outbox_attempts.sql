-- 008: outbox 毒丸上限（A1）
-- 畸形/永久失败事件重试 OUTBOX_MAX_ATTEMPTS（publisher 常量=5）次后停泊：
-- 扫描与 NOTIFY 消费均排除 attempts 达标行，避免单坏 payload 慢性阻塞整条审计管道。
-- 死信可见性：outbox_dead_letters_total 指标 + AUDIT_DEAD_LETTER 日志；人工修复后
-- 重置 attempts = 0 即可重新入队（不删除事件，保审计完整语义，ADR-005）。
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error TEXT;
