-- =============================================================================
-- 迁移 v13：删除冗余索引 idx_users_username
-- 描述：users.username 已有 UNIQUE 约束（自动创建唯一索引），idx_users_username 重复
-- =============================================================================

-- 企业理由：users 表 username 列在 migration 004 中已定义 UNIQUE 约束，
-- PostgreSQL 自动为 UNIQUE 约束创建 B-Tree 索引，idx_users_username 与其完全重复。
-- 冗余索引使写入放大（INSERT/UPDATE 需同时维护两个 B-Tree），无查询收益。
-- 权衡：删除后需 EXPLAIN 验证查询仍走唯一约束索引。
DROP INDEX IF EXISTS idx_users_username;
