-- =============================================================================
-- P2-04: 审计日志链式校验 — 添加 prev_hash 列
-- =============================================================================
-- 企业理由：HMAC 签名检测单条记录篡改，但无法检测整条记录被删除（DBA 删除
-- 审计行）。链式 hash（每条记录的 prev_hash = SHA256(prev.id || prev.hmac_signature)）
-- 将所有记录链接成链，删除中间任何一条都会导致链断裂，verify-audit-chain.ts
-- 脚本可检测到断裂点。
-- ==============================================================================

-- 1) 添加 prev_hash 列（NULL = 链中第一条记录或迁移前的历史记录）
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64);

-- 2) 索引：加速链式验证查询（按 created_at 顺序遍历）
CREATE INDEX IF NOT EXISTS idx_audit_logs_chain ON audit_logs (created_at ASC, id ASC)
  WHERE prev_hash IS NOT NULL;
