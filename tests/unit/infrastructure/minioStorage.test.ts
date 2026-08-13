import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const minioMocks = vi.hoisted(() => {
  const client = { bucketExists: vi.fn(), makeBucket: vi.fn(), putObject: vi.fn() };
  return {
    client,
    Client: class {
      bucketExists = client.bucketExists;
      makeBucket = client.makeBucket;
      putObject = client.putObject;
    },
  };
});

const configMocks = vi.hoisted(() => ({
  MINIO_ENDPOINT: '',
  MINIO_PORT: 9000,
  MINIO_USE_SSL: true,
  MINIO_ACCESS_KEY: 'test-ak',
  MINIO_SECRET_KEY: 'test-sk',
  AUDIT_RETENTION_DAYS: 30,
}));

vi.mock('minio', () => ({ Client: minioMocks.Client }));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
  validateConfig: vi.fn(),
}));

import {
  isMinioConfigured,
  ensureBucketExists,
  uploadAuditObject,
} from '../../../packages/backend/src/infrastructure/minioStorage.js';

describe('minioStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isMinioConfigured 应反映 MINIO_ENDPOINT 是否存在', () => {
    configMocks.MINIO_ENDPOINT = '';
    expect(isMinioConfigured()).toBe(false);
    configMocks.MINIO_ENDPOINT = 'localhost';
    expect(isMinioConfigured()).toBe(true);
  });

  it('未配置时 ensureBucketExists/uploadAuditObject 应安全跳过', async () => {
    configMocks.MINIO_ENDPOINT = '';
    await expect(ensureBucketExists()).resolves.toBeUndefined();
    await expect(uploadAuditObject('k', 'data')).resolves.toBe(false);
    expect(minioMocks.client.bucketExists).not.toHaveBeenCalled();
  });

  describe('配置后', () => {
    beforeEach(() => {
      configMocks.MINIO_ENDPOINT = 'minio.local';
    });

    it('bucket 已存在时不重复创建', async () => {
      minioMocks.client.bucketExists.mockResolvedValue(true);
      await ensureBucketExists();
      expect(minioMocks.client.makeBucket).not.toHaveBeenCalled();
    });

    it('bucket 不存在时创建（Object Lock 已启用）', async () => {
      minioMocks.client.bucketExists.mockResolvedValue(false);
      await ensureBucketExists();
      expect(minioMocks.client.makeBucket).toHaveBeenCalledWith('audit-logs', 'us-east-1', {
        ObjectLocking: true,
      });
    });

    it('上传字符串数据应转 Buffer 并带 WORM 元数据', async () => {
      minioMocks.client.putObject.mockResolvedValue(undefined);
      await expect(uploadAuditObject('audit/2024/01.jsonl', 'line1\n')).resolves.toBe(true);
      expect(minioMocks.client.putObject).toHaveBeenCalledWith(
        'audit-logs',
        'audit/2024/01.jsonl',
        expect.any(Buffer),
        expect.any(Number),
        expect.objectContaining({
          'Content-Type': 'application/x-ndjson',
          'x-amz-object-lock-mode': 'COMPLIANCE',
        }),
      );
    });

    it('上传失败时应降级返回 false 而非抛出', async () => {
      minioMocks.client.putObject.mockRejectedValue(new Error('minio down'));
      await expect(uploadAuditObject('k', Buffer.from('x'))).resolves.toBe(false);
    });
  });
});
