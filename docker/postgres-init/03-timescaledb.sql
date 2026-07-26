-- =============================================================================
-- PostgreSQL 初始化：预装 TimescaleDB 扩展（P1-02）
-- =============================================================================
-- 由 docker-entrypoint-initdb.d 在数据库初始化阶段以超级用户执行。
-- 迁移 018_timescaledb.sql 中的 CREATE EXTENSION IF NOT EXISTS timescaledb
-- 在此场景下为幂等 no-op，避免应用层需要超级用户权限。
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;
