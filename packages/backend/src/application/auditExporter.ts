// P2-03: HMAC 校验后写 MinIO WORM（Object Lock COMPLIANCE）；MinIO 未配置时 fail-closed
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
} from '../infrastructure/minioStorage.js';

interface ExportResult {
  processed: number;
  exported: number;
  skipped: number;
  objectKeys: string[];
  minioConfigured: boolean;
}

export async function exportPendingAuditLogs(): Promise<ExportResult> {
  const result: ExportResult = {
    processed: 0,
    exported: 0,
    skipped: 0,
    objectKeys: [],
    minioConfigured: isMinioConfigured(),
  };

  const logs = await getUnexportedAuditLogs();
  result.processed = logs.length;
  if (logs.length === 0) {
    logger.debug('[auditExporter] 无待导出审计日志');
    return result;
  }

  if (!result.minioConfigured) {
    logger.warn(
      { count: logs.length },
      '[auditExporter] MinIO 未配置，跳过导出（审计日志仍留 DB）',
    );
    return result;
  }

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
      const ids = groupLogs.map((l) => l.id);
      await markExported(ids, objectKey);
      logger.info(
        { objectKey, count: groupLogs.length },
        '[auditExporter] 审计日志批次已导出至 MinIO WORM',
      );
    } else {
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

function groupByDate(logs: AuditLogRow[]): Map<string, AuditLogRow[]> {
  const grouped = new Map<string, AuditLogRow[]>();
  for (const log of logs) {
    const dateKey = log.createdAt.slice(0, 10).replace(/-/g, '/');
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(log);
  }
  return grouped;
}

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
