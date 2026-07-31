/**
 * 审计日志导出作业（P2-03 不可篡改审计存储）
 *
 * Architecture: 应用层 — 批量导出作业，将 DB 中未导出的审计日志按日期分组上传至
 * MinIO WORM bucket（Object Lock COMPLIANCE 模式）。设计为 BullMQ 重复任务，
 * 每 5 分钟执行一次（由 queues 层调度，本模块仅提供纯函数入口）。
 *
 * 企业为何需要：DB 中的 audit_logs 表虽含 HMAC 签名可检测篡改，但 DBA 仍可修改
 * 行数据。导出至 MinIO Object Lock COMPLIANCE 模式后，对象一旦写入即在保留期内
 * 不可删除/覆盖，从存储层根除篡改可能。定期导出（非实时）在合规与性能间取得
 * 平衡——审计日志写入不阻塞于 MinIO 上传，导出作业异步批量处理。
 *
 * 导出流程：
 * 1. 拉取未导出审计日志（exported_at IS NULL，按 created_at 正序）
 * 2. 上传前逐条校验 HMAC 完整性（防 DB 已被篡改的记录进入 WORM）
 * 3. 按日期分组（UTC），每组生成一个 JSONL 对象（key: audit/YYYY/MM/DD/<batch-id>.jsonl）
 * 4. 上传至 MinIO（COMPLIANCE WORM）
 * 5. 上传成功后回填 object_key + exported_at
 *
 * 权衡：
 * - 按日期分组而非单条上传：减少 MinIO 对象数量，便于按日期归档与检索；
 *   batch-id（随机 UUID）避免同日多次导出产生键冲突。
 * - 上传前 HMAC 校验：若 DB 记录已被篡改（签名不匹配），跳过该条并记录 warning，
 *   避免将已篡改数据固化到 WORM（WORM 不可改，写入即永久）。
 * - MinIO 未配置时静默跳过（fail-closed），审计日志仍留 DB，待配置就绪后补传。
 * - 单批 100 条上限避免长事务与超大对象；未导出记录积压时下次作业自动续传。
 */
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import {
  getUnexportedAuditLogs,
  markExported,
  verifyAuditIntegrity,
  type AuditLogRow,
  type AuditAction,
} from './auditStorageService.js';
import {
  ensureBucketExists,
  uploadAuditObject,
  isMinioConfigured,
} from '../infrastructure/minioClient.js';

const EXPORT_BATCH_SIZE = 100;

interface ExportResult {
  processed: number;
  exported: number;
  skipped: number;
  objectKeys: string[];
  minioConfigured: boolean;
}

/**
 * 导出待导出的审计日志至 MinIO WORM bucket。
 *
 * 流程：
 * 1. 拉取未导出记录（limit 100，按 created_at 正序）
 * 2. 若 MinIO 未配置，记录 warning 并返回（审计日志仍留 DB）
 * 3. 确保 bucket 存在
 * 4. 逐条校验 HMAC 完整性（跳过已篡改记录）
 * 5. 按日期分组，每组生成 JSONL 上传至 MinIO
 * 6. 上传成功后回填 object_key + exported_at
 *
 * @returns 导出结果统计
 */
export async function exportPendingAuditLogs(): Promise<ExportResult> {
  const result: ExportResult = {
    processed: 0,
    exported: 0,
    skipped: 0,
    objectKeys: [],
    minioConfigured: isMinioConfigured(),
  };

  const logs = await getUnexportedAuditLogs(EXPORT_BATCH_SIZE);
  result.processed = logs.length;
  if (logs.length === 0) {
    logger.debug('[auditExporter] 无待导出审计日志');
    return result;
  }

  // 2. MinIO 未配置时静默跳过（fail-closed）
  if (!result.minioConfigured) {
    logger.warn(
      { count: logs.length },
      '[auditExporter] MinIO 未配置，跳过导出（审计日志仍留 DB）',
    );
    return result;
  }

  // 3. 确保 bucket 存在
  await ensureBucketExists();

  const validLogs: AuditLogRow[] = [];
  for (const log of logs) {
    const verification = await verifyAuditIntegrity(log.id);
    if (verification.valid) {
      validLogs.push(log);
    } else {
      result.skipped++;
      logger.warn(
        { logId: log.id, eventType: log.eventType },
        '[auditExporter] HMAC 校验失败，跳过导出（疑似篡改，不写入 WORM）',
      );
    }
  }

  if (validLogs.length === 0) {
    logger.warn(
      { total: logs.length, skipped: result.skipped },
      '[auditExporter] 全部记录 HMAC 校验失败，无有效记录可导出',
    );
    return result;
  }

  const groupedByKey = groupByDate(validLogs);

  for (const [dateKey, groupLogs] of groupedByKey) {
    const batchId = crypto.randomUUID();
    const objectKey = `audit/${dateKey}/${batchId}.jsonl`;
    const jsonl = buildJsonl(groupLogs);

    const uploaded = await uploadAuditObject(objectKey, jsonl);
    if (uploaded) {
      result.exported += groupLogs.length;
      result.objectKeys.push(objectKey);
      // 回填 object_key + exported_at
      const ids = groupLogs.map((l) => l.id);
      await markExported(ids, objectKey);
      logger.info(
        { objectKey, count: groupLogs.length },
        '[auditExporter] 审计日志批次已导出至 MinIO WORM',
      );
    } else {
      // 上传失败：不回填 exported_at，下次作业自动重试
      logger.error(
        { objectKey, count: groupLogs.length },
        '[auditExporter] 审计日志批次上传失败，下次作业将重试',
      );
    }
  }

  logger.info(
    {
      processed: result.processed,
      exported: result.exported,
      skipped: result.skipped,
      objects: result.objectKeys.length,
    },
    '[auditExporter] 导出作业完成',
  );
  return result;
}

/**
 * 将审计日志按 UTC 日期分组（YYYY/MM/DD）。
 *
 * 企业理由：按日期分组使每个 MinIO 对象对应一天的一批审计日志，便于按日期归档
 * 与检索。使用 UTC 而非本地时区，保证跨时区部署的分组一致性。
 *
 * @param logs - 审计日志数组（已按 created_at 正序）
 * @returns Map<日期键(YYYY/MM/DD), 当日日志数组>
 */
function groupByDate(logs: AuditLogRow[]): Map<string, AuditLogRow[]> {
  const grouped = new Map<string, AuditLogRow[]>();
  for (const log of logs) {
    const date = new Date(log.createdAt);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const dateKey = `${year}/${month}/${day}`;
    const group = grouped.get(dateKey);
    if (group) {
      group.push(log);
    } else {
      grouped.set(dateKey, [log]);
    }
  }
  return grouped;
}

/**
 * 将审计日志数组构建为 JSONL（JSON Lines）字符串。
 *
 * 每行一个 JSON 对象（含 id / eventType / action / payload / hmacSignature /
 * createdAt），行间以换行符分隔。JSONL 格式便于流式处理与按行检索。
 *
 * @param logs - 同一天的审计日志数组
 * @returns JSONL 字符串
 */
function buildJsonl(logs: AuditLogRow[]): string {
  return logs
    .map((log) =>
      JSON.stringify({
        id: log.id,
        eventType: log.eventType,
        userId: log.userId,
        orgId: log.orgId,
        ipAddress: log.ipAddress,
        action: log.action as AuditAction,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        payload: log.payload,
        hmacSignature: log.hmacSignature,
        createdAt: log.createdAt,
      }),
    )
    .join('\n');
}
