#!/bin/bash
# =============================================================================
# WAL-G 安装脚本（P0-06，等保三级 8.1.4 数据备份与恢复）
# =============================================================================
# 由 PostgreSQL 容器的 docker-entrypoint-initdb.d 自动执行（首次初始化时）。
# 下载 WAL-G 二进制到 /usr/local/bin，使其可用于 archive_command / restore_command。
#
# WAL-G 版本：v3.0.3（2025 稳定版，支持 PostgreSQL 16 + brotli 压缩）
# =============================================================================
set -euo pipefail

WALG_VERSION="v3.0.3"
WALG_URL="https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-ubuntu-20.04-amd64.tar.gz"

echo "[install-walg] Installing WAL-G ${WALG_VERSION}..."

# 检查是否已安装（幂等性）
if command -v wal-g >/dev/null 2>&1; then
  echo "[install-walg] WAL-G already installed: $(wal-g --version 2>&1 || echo 'unknown')"
  exit 0
fi

# 安装依赖
apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null

# 下载并安装 WAL-G
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$WALG_URL" -o "$TMP_DIR/wal-g.tar.gz"
tar -xzf "$TMP_DIR/wal-g.tar.gz" -C "$TMP_DIR"
mv "$TMP_DIR/wal-g-pg-ubuntu-20.04-amd64" /usr/local/bin/wal-g
chmod +x /usr/local/bin/wal-g

# 安装 envdir（daemontools 包），archive_command 使用 envdir 读取环境变量
if ! command -v envdir >/dev/null 2>&1; then
  apt-get install -y -qq daemontools >/dev/null 2>&1 || true
fi

echo "[install-walg] WAL-G installed: $(wal-g --version 2>&1 || echo 'unknown')"
echo "[install-walg] Done."
