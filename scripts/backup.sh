#!/bin/bash
# 数据备份脚本
#
# 企业理由：8000+ JSON 文件唯一副本风险高，无备份 = 无灾难恢复能力。
# 定时备份确保数据可恢复，是运维基线要求。
# 使用方式：crontab -e 添加 "0 2 * * * /path/to/backup.sh"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/data"
BACKUP_DIR="$PROJECT_DIR/data-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="backup_${TIMESTAMP}"

# 保留最近 7 份备份
MAX_BACKUPS=7

echo "[backup] 开始备份 $DATA_DIR ..."

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 复制数据目录（排除缓存）
cp -r "$DATA_DIR" "$BACKUP_DIR/$BACKUP_NAME"
# 删除缓存目录（可重新生成）
rm -rf "$BACKUP_DIR/$BACKUP_NAME/cache"

# 压缩备份
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo "[backup] 备份完成: ${BACKUP_NAME}.tar.gz"

# 清理旧备份
ls -t "$BACKUP_DIR"/backup_*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm
echo "[backup] 已清理旧备份，保留最近 $MAX_BACKUPS 份"
