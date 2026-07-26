#!/bin/bash
# =============================================================================
# MinIO Bucket 初始化脚本（P0-06，创建 WAL-G 备份 bucket）
# =============================================================================
# 在 MinIO 中创建 backtest-wal-backup bucket（用于 WAL-G 备份存储）。
# 可选：启用 Object Lock（WORM 模式）防止备份被篡改/删除。
#
# 用法：
#   bash scripts/init-minio-buckets.sh
#
# 前提：docker compose up -d minio 已启动
# =============================================================================
set -euo pipefail

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
WALG_BUCKET="${MINIO_WALG_BUCKET:-backtest-wal-backup}"
AUDIT_BUCKET="audit-logs"

echo "[init-minio] Creating MinIO buckets..."

# 使用 mc (MinIO Client) 创建 bucket
# 在 minio 容器内执行，避免本地安装 mc
docker exec backtest-minio sh -c "
  mc alias set local http://localhost:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD} 2>/dev/null

  # WAL-G 备份 bucket
  if ! mc ls local/${WALG_BUCKET} >/dev/null 2>&1; then
    mc mb local/${WALG_BUCKET}
    echo '[init-minio] Created bucket: ${WALG_BUCKET}'
  else
    echo '[init-minio] Bucket already exists: ${WALG_BUCKET}'
  fi

  # 审计日志 bucket（P2-03，Object Lock WORM）
  if ! mc ls local/${AUDIT_BUCKET} >/dev/null 2>&1; then
    mc mb --with-lock local/${AUDIT_BUCKET} 2>/dev/null && \
      echo '[init-minio] Created bucket with Object Lock: ${AUDIT_BUCKET}' || \
      echo '[init-minio] Created bucket (no Object Lock): ${AUDIT_BUCKET}'
  else
    echo '[init-minio] Bucket already exists: ${AUDIT_BUCKET}'
  fi

  # 设置备份 bucket 生命周期：90 天后自动过期旧版本
  mc ilm add local/${WALG_BUCKET} --expire-days 90 2>/dev/null || true

  echo '[init-minio] Done.'
"
