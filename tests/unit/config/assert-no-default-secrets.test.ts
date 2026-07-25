/**
 * P0-02 单元测试：默认密钥启动拦截
 *
 * 企业理由：生产环境使用默认密钥（JWT_SECRET/ENGINE_AUTH_TOKEN/DATA_SERVICE_AUTH_TOKEN）
 * 是严重安全漏洞——源码公开即等于密钥泄露。必须在启动时 fail-fast 阻止。
 *
 * 测试场景：
 *   1. NODE_ENV=production + 默认密钥 → process.exit(1)
 *   2. NODE_ENV=development + 默认密钥 → 不退出（允许开发环境使用默认值）
 *   3. NODE_ENV=production + 非默认密钥 → 不退出
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertNoDefaultSecrets } from '../../../packages/backend/src/config/assertNoDefaultSecrets.js';

describe('P0-02: assertNoDefaultSecrets — 默认密钥启动拦截', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('生产环境 + 默认 JWT_SECRET → process.exit(1)', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'a-very-strong-token',
      DATA_SERVICE_AUTH_TOKEN: 'another-strong-token',
    };

    assertNoDefaultSecrets(config);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('JWT_SECRET'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('生产环境 + 默认 ENGINE_AUTH_TOKEN → process.exit(1)', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'a-very-strong-secret',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'another-strong-token',
    };

    assertNoDefaultSecrets(config);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ENGINE_AUTH_TOKEN'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('生产环境 + 默认 DATA_SERVICE_AUTH_TOKEN → process.exit(1)', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'a-very-strong-secret',
      ENGINE_AUTH_TOKEN: 'a-very-strong-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };

    assertNoDefaultSecrets(config);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DATA_SERVICE_AUTH_TOKEN'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('生产环境 + 多个默认密钥 → 错误信息包含所有违规字段', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };

    assertNoDefaultSecrets(config);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errorMessage = (errorSpy.mock.calls[0] as unknown[])[0] as string;
    expect(errorMessage).toContain('JWT_SECRET');
    expect(errorMessage).toContain('ENGINE_AUTH_TOKEN');
    expect(errorMessage).toContain('DATA_SERVICE_AUTH_TOKEN');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('开发环境 + 默认密钥 → 不退出（允许开发环境使用默认值）', () => {
    process.env.NODE_ENV = 'development';
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };

    assertNoDefaultSecrets(config);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('生产环境 + 全部非默认密钥 → 不退出', () => {
    process.env.NODE_ENV = 'production';
    const config = {
      JWT_SECRET: 'a-super-strong-jwt-secret-for-production',
      ENGINE_AUTH_TOKEN: 'a-super-strong-engine-token',
      DATA_SERVICE_AUTH_TOKEN: 'a-super-strong-data-service-token',
    };

    assertNoDefaultSecrets(config);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('NODE_ENV 未设置 → 不检查（等同非生产环境）', () => {
    delete process.env.NODE_ENV;
    const config = {
      JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
      ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
      DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
    };

    assertNoDefaultSecrets(config);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
