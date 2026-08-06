import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const mocks = vi.hoisted(() => ({
  countActivePlatformAdminKeys: vi.fn(),
  createPlatformAdminKey: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('../../../packages/backend/src/repositories/apiKeyRepo.js', () => ({
  countActivePlatformAdminKeys: mocks.countActivePlatformAdminKeys,
  createPlatformAdminKey: mocks.createPlatformAdminKey,
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS: 90,
}));

import { bootstrapPlatformAdminKey } from '../../../packages/backend/src/infrastructure/adminBoot.js';

describe('bootstrapPlatformAdminKey', () => {
  const originalAdminKey = process.env.ADMIN_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_API_KEY;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (originalAdminKey === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = originalAdminKey;
    process.env.NODE_ENV = originalNodeEnv;
  });
  it('DB 已有有效平台密钥 + 环境变量存在 → 跳过并警告忽略环境变量', async () => {
    process.env.ADMIN_API_KEY = 'env-admin-key';
    mocks.countActivePlatformAdminKeys.mockResolvedValue(1);

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(false);
    expect(mocks.createPlatformAdminKey).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('环境变量 ADMIN_API_KEY 将被忽略'),
    );
  });

  it('DB 已有有效平台密钥 + 无环境变量 → 跳过，不警告', async () => {
    mocks.countActivePlatformAdminKeys.mockResolvedValue(2);

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(false);
    expect(mocks.createPlatformAdminKey).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('DB 无密钥 + 环境变量存在 → 创建 DB 记录并返回 true', async () => {
    process.env.ADMIN_API_KEY = 'env-admin-key-123';
    mocks.countActivePlatformAdminKeys.mockResolvedValue(0);
    mocks.createPlatformAdminKey.mockResolvedValue({ plaintext: 'x', id: 'id' });

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(true);
    expect(mocks.createPlatformAdminKey).toHaveBeenCalledTimes(1);
    expect(mocks.createPlatformAdminKey).toHaveBeenCalledWith(
      'env-admin-key-123',
      'bootstrapped-from-env',
      90,
      null,
    );
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('迁移为 DB 平台 break-glass 密钥'),
    );
  });

  it('DB 无密钥 + 无环境变量 + 非生产环境 → 跳过，不警告', async () => {
    process.env.NODE_ENV = 'test';
    mocks.countActivePlatformAdminKeys.mockResolvedValue(0);

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(false);
    expect(mocks.createPlatformAdminKey).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('DB 无密钥 + 无环境变量 + 生产环境 → 跳过并警告缺失 break-glass', async () => {
    process.env.NODE_ENV = 'production';
    mocks.countActivePlatformAdminKeys.mockResolvedValue(0);

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(false);
    expect(mocks.createPlatformAdminKey).not.toHaveBeenCalled();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('生产环境未配置平台 break-glass 密钥'),
    );
  });

  it('createPlatformAdminKey 抛错 → 捕获异常，返回 false 并记录错误', async () => {
    process.env.ADMIN_API_KEY = 'env-admin-key';
    mocks.countActivePlatformAdminKeys.mockResolvedValue(0);
    mocks.createPlatformAdminKey.mockRejectedValue(new Error('DB connection lost'));

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(false);
    expect(loggerMocks.error).toHaveBeenCalled();
  });

  it('countActivePlatformAdminKeys 抛错 → 捕获异常，返回 false 并记录错误', async () => {
    process.env.ADMIN_API_KEY = 'env-admin-key';
    mocks.countActivePlatformAdminKeys.mockRejectedValue(new Error('query failed'));

    const result = await bootstrapPlatformAdminKey();

    expect(result).toBe(false);
    expect(mocks.createPlatformAdminKey).not.toHaveBeenCalled();
    expect(loggerMocks.error).toHaveBeenCalled();
  });
});
