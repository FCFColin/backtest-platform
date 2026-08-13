-- 007: outbox 行插入即 NOTIFY（ADR-005）
-- 事务内 INSERT 的 NOTIFY 在 COMMIT 后才送达，事务回滚则静默；替代应用层手动 NOTIFY（auditMiddleware 非事务路径），消除事务路径 5 分钟补偿扫描延迟。
CREATE OR REPLACE FUNCTION outbox_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_channel', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_outbox_notify
AFTER INSERT ON outbox
FOR EACH ROW
EXECUTE FUNCTION outbox_notify();
