import { Client } from 'minio';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const AUDIT_BUCKET = 'audit-logs';
let minioClient: Client | null = null;

export const isMinioConfigured = (): boolean => Boolean(config.MINIO_ENDPOINT);

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

async function withMinio<T>(
  fn: (client: Client) => Promise<T>,
  fallback: T,
  tag: string,
): Promise<T> {
  const client = getClient();
  if (!client) {
    logger.warn({ module: 'minioClient' }, `[minio] MinIO 未配置，跳过 ${tag}`);
    return fallback;
  }
  try {
    return await fn(client);
  } catch (err) {
    logger.error({ err: (err as Error).message, tag }, `[minio] ${tag} 失败`);
    return fallback;
  }
}

export async function ensureBucketExists(): Promise<void> {
  await withMinio(
    async (c) => {
      if (await c.bucketExists(AUDIT_BUCKET)) return;
      await c.makeBucket(AUDIT_BUCKET, 'us-east-1', { ObjectLocking: true });
      logger.info(
        { module: 'minioClient', bucket: AUDIT_BUCKET },
        '[minio] 已创建审计 bucket（Object Lock 已启用）',
      );
    },
    undefined,
    'bucket 初始化',
  );
}

export async function uploadAuditObject(key: string, data: string | Buffer): Promise<boolean> {
  return withMinio(
    async (client) => {
      const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
      const metaData = {
        'Content-Type': 'application/x-ndjson',
        'x-amz-object-lock-mode': 'COMPLIANCE',
        'x-amz-object-lock-retain-until-date': new Date(
          Date.now() + config.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
      await client.putObject(AUDIT_BUCKET, key, body, body.length, metaData);
      logger.info(
        {
          module: 'minioClient',
          key,
          size: body.length,
          retentionDays: config.AUDIT_RETENTION_DAYS,
        },
        '[minio] 审计对象已上传（COMPLIANCE WORM）',
      );
      return true;
    },
    false,
    '审计对象上传',
  );
}
