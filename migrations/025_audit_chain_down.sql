-- 025_audit_chain DOWN: 移除 prev_hash 列
DROP INDEX IF EXISTS idx_audit_logs_chain;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS prev_hash;
