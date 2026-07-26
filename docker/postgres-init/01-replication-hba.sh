#!/bin/bash
# =============================================================================
# pg_hba.conf 复制连接授权（P1-02 T3，流复制读写分离）
# =============================================================================
# PostgreSQL 默认 pg_hba.conf 不包含 replication 伪数据库条目，
# 副本 pg_basebackup 需通过 replication 协议连接主库。
# 本脚本在数据库首次初始化时追加 replication 条目到 pg_hba.conf。
#
# 安全说明：
# - 本地开发允许 0.0.0.0/0（所有 IP），生产环境须限制为副本子网
# - 认证方式 scram-sha-256（与 POSTGRES_HOST_AUTH_METHOD 默认一致）
# =============================================================================

set -e

echo "[01-replication-hba] Adding replication entry to pg_hba.conf..."

# 追加 replication 授权条目（幂等：检查是否已存在）
if ! grep -q "host.*replication.*replicator" "${PGDATA}/pg_hba.conf" 2>/dev/null; then
  echo "host replication replicator 0.0.0.0/0 scram-sha-256" >> "${PGDATA}/pg_hba.conf"
  echo "[01-replication-hba] Replication entry added."
else
  echo "[01-replication-hba] Replication entry already exists, skipping."
fi
