/**
 * MinIO 客户端（P2-03 不可篡改审计存储）
 *
 * Architecture: 基础设施层 — 封装 MinIO S3 兼容对象存储客户端，提供 WORM（Write Once
 * Read Many）语义的审计对象存储能力。Object Lock COMPLIANCE 模式确保对象一旦写入
 * 即在保留期内不可删除/覆盖（即便管理员也无法绕过），满足等保三级 8.1.4 审计日志
 * 不可篡改要求。
 *
 * 企业为何需要：DB 中的 audit_logs 表虽含 HMAC 签名可检测篡改，但 DBA 仍可直接修改
 * 行数据并重算签名（若拿到 HMAC 密钥）。MinIO Object Lock COMPLIANCE 模式从存储层
 * 根除篡改可能——对象写入后保留期内（默认 180 天）任何删除/覆盖请求都会被拒绝，
 * 形成双层防篡改：DB 层 HMAC 检测 + 存储层 WORM 不可变。
 *
 * Fail-closed 设计：MinIO 未配置（MINIO_ENDPOINT 缺失）时，仅记录 warning 日志并跳过
 * 上传，审计日志仍保留在 DB 中（HMAC 签名仍提供篡改检测）。不阻断导出作业流程，
 * 待 MinIO 配置就绪后下次扫描自动补传。权衡：未导出期间缺少 WORM 保护，但 DB 层
 * HMAC 仍是有效防线；fail-closed（拒绝启动）会阻断审计写入，反而更危险。
 *
 * 权衡：
 * - 使用 minio（官方 SDK，npm 包名 `minio`）而非 aws-sdk：MinIO 扩展了 S3 协议
 *   （Object Lock 配置 API），官方 SDK 兼容性最佳。
 * - Object Lock 保留期取自 config.AUDIT_RETENTION_DAYS（等保三级 ≥180 天）。
 * - bucket 创建时即启用 Object Lock（创建后无法追加启用），幂等检查 bucketExists。
 */
import { Client } from 'minio';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/** 审计日志专用 bucket 名称 */
export const AUDIT_BUCKET = 'audit-logs';

let minioClient: Client | null = null;

/**
 * MinIO 是否已配置（MINIO_ENDPOINT 非空即视为已配置）。
 *
 * Fail-closed 判定入口：未配置时所有上传/下载操作静默跳过，审计日志仅留 DB。
 */
export function isMinioConfigured(): boolean {
  return Boolean(config.MINIO_ENDPOINT);
}

/**
 * 获取 MinIO 客户端单例（懒初始化）。
 *
 * 仅在首次调用且 MinIO 已配置时创建客户端，避免未配置时的无谓连接尝试。
 * @returns MinIO Client 实例；未配置时返回 null
 */
function getClient(): Client | null {
  if (!isMinioConfigured()) return null;
  if (minioClient) return minioClient;

  minioClient = new Client({
    endPoint: config.MINIO_ENDPOINT,
    port: config.MINIO_PORT,
    useSSL: config.MINIO_USE_SSL,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
  });
  logger.info(
    {
      module: 'minioClient',
      endPoint: config.MINIO_ENDPOINT,
      port: config.MINIO_PORT,
      useSSL: config.MINIO_USE_SSL,
    },
    '[minio] MinIO 客户端已初始化',
  );
  return minioClient;
}

/**
 * 确保审计 bucket 存在且启用 Object Lock（幂等）。
 *
 * Object Lock 必须在 bucket 创建时启用，已存在的非 Object Lock bucket 无法追加。
 * 因此本函数仅在 bucket 不存在时创建（带 Object Lock），已存在则跳过。
 *
 * 企业理由：导出作业每次执行前调用以确保 bucket 就绪；幂等设计避免重复创建报错。
 * 未配置 MinIO 时静默跳过（fail-closed）。
 */
export async function ensureBucketExists(): Promise<void> {
  const client = getClient();
  if (!client) {
    logger.warn('[minio] MinIO 未配置，跳过 bucket 初始化（审计日志仅留 DB）');
    return;
  }

  try {
    const exists = await client.bucketExists(AUDIT_BUCKET);
    if (exists) {
      logger.debug({ module: 'minioClient', bucket: AUDIT_BUCKET }, '[minio] bucket 已存在');
      return;
    }
    // 创建 bucket 并启用 Object Lock（COMPLIANCE 模式由对象级保留头控制）
    // MakeBucketOpt 字段名为 ObjectLocking（minio SDK 8.x 类型定义）
    await client.makeBucket(AUDIT_BUCKET, 'us-east-1', { ObjectLocking: true });
    logger.info(
      { module: 'minioClient', bucket: AUDIT_BUCKET },
      '[minio] 已创建审计 bucket（Object Lock 已启用）',
    );
  } catch (err) {
    logger.error(
      { err: (err as Error).message, bucket: AUDIT_BUCKET },
      '[minio] bucket 初始化失败',
    );
    throw err;
  }
}

/**
 * 计算 Object Lock 保留截止时间（从现在起 + AUDIT_RETENTION_DAYS 天）。
 * @returns ISO 8601 格式的保留截止时间字符串
 */
function computeRetainUntilDate(): string {
  const retainUntil = new Date(Date.now() + config.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return retainUntil.toISOString();
}

/**
 * 上传审计对象至 MinIO WORM bucket（COMPLIANCE 模式保留）。
 *
 * 上传时通过 `x-amz-object-lock-mode` / `x-amz-object-lock-retain-until-date` 头
 * 设置 COMPLIANCE 保留——保留期内任何删除/覆盖请求都会被 MinIO 拒绝（403），
 * 包括 root 管理员。保留期取自 config.AUDIT_RETENTION_DAYS（默认 180 天）。
 *
 * @param key - 对象键（如 `audit/2026/07/25/<batch-id>.jsonl`）
 * @param data - 对象内容（JSONL 字符串或 Buffer）
 * @returns 上传成功返回 true；MinIO 未配置或上传失败返回 false
 */
export async function uploadAuditObject(key: string, data: string | Buffer): Promise<boolean> {
  const client = getClient();
  if (!client) {
    logger.warn({ module: 'minioClient', key }, '[minio] MinIO 未配置，跳过审计对象上传');
    return false;
  }

  try {
    const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const metaData = {
      'Content-Type': 'application/x-ndjson',
      // Object Lock COMPLIANCE 模式：保留期内不可删除/覆盖
      'x-amz-object-lock-mode': 'COMPLIANCE',
      'x-amz-object-lock-retain-until-date': computeRetainUntilDate(),
    };
    await client.putObject(AUDIT_BUCKET, key, body, body.length, metaData);
    logger.info(
      { module: 'minioClient', key, size: body.length, retentionDays: config.AUDIT_RETENTION_DAYS },
      '[minio] 审计对象已上传（COMPLIANCE WORM）',
    );
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message, key }, '[minio] 审计对象上传失败');
    return false;
  }
}

/**
 * 下载审计对象（用于完整性校验或审计追溯）。
 *
 * @param key - 对象键
 * @returns 对象内容字符串；MinIO 未配置或对象不存在时返回 null
 */
export async function downloadAuditObject(key: string): Promise<string | null> {
  const client = getClient();
  if (!client) {
    logger.warn({ module: 'minioClient', key }, '[minio] MinIO 未配置，跳过审计对象下载');
    return null;
  }

  try {
    const stream = await client.getObject(AUDIT_BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err) {
    logger.error({ err: (err as Error).message, key }, '[minio] 审计对象下载失败');
    return null;
  }
}