/**
 * H-006 单元测试：硬编码 secret 移除验证
 *
 * 企业理由：JWT_SECRET / ENGINE_AUTH_TOKEN / DATA_SERVICE_AUTH_TOKEN 原先有
 * 硬编码默认值（|| 'dev-...'），源码公开即等于密钥泄露。修复后使用 requireSecret()
 * 在 env var 缺失时 fail-fast throw。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock dotenv 避免 .env 干扰
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

import { requireSecret } from '../../../packages/backend/src/config/env.js';

describe('H-006: requireSecret — secret 缺失时 throw', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.TEST_SECRET_H006 = process.env.TEST_SECRET_H006;
  });

  afterEach(() => {
    if (originalEnv.TEST_SECRET_H006 === undefined) delete process.env.TEST_SECRET_H006;
    else process.env.TEST_SECRET_H006 = originalEnv.TEST_SECRET_H006;
  });

  it('env var 缺失时 throw 包含变量名', () => {
    delete process.env.TEST_SECRET_H006;
    expect(() => requireSecret('TEST_SECRET_H006')).toThrow('TEST_SECRET_H006');
  });

  it('env var 为空字符串时 throw', () => {
    process.env.TEST_SECRET_H006 = '';
    expect(() => requireSecret('TEST_SECRET_H006')).toThrow('TEST_SECRET_H006');
  });

  it('env var 已设置时返回值', () => {
    process.env.TEST_SECRET_H006 = 'a-strong-secret-value';
    expect(requireSecret('TEST_SECRET_H006')).toBe('a-strong-secret-value');
  });
});

describe('H-006: authConfig / engineConfig 源码不含硬编码默认值', () => {
  it("authConfig.ts 不含 hardcoded dev- defaults", () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/backend/src/config/authConfig.ts'),
      'utf-8',
    );
    expect(source).not.toContain("|| 'dev-");
  });

  it("engineConfig.ts 不含 hardcoded dev- defaults", () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/backend/src/config/engineConfig.ts'),
      'utf-8',
    );
    expect(source).not.toContain("|| 'dev-");
  });

  it('authConfig.ts 使用 requireSecret 获取 JWT_SECRET', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/backend/src/config/authConfig.ts'),
      'utf-8',
    );
    expect(source).toContain("requireSecret('JWT_SECRET')");
  });

  it('engineConfig.ts 使用 requireSecret 获取 ENGINE_AUTH_TOKEN', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/backend/src/config/engineConfig.ts'),
      'utf-8',
    );
    expect(source).toContain("requireSecret('ENGINE_AUTH_TOKEN')");
  });

  it('engineConfig.ts 使用 requireSecret 获取 DATA_SERVICE_AUTH_TOKEN', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/backend/src/config/engineConfig.ts'),
      'utf-8',
    );
    expect(source).toContain("requireSecret('DATA_SERVICE_AUTH_TOKEN')");
  });
});

describe('H-006: 模块导入 — secret 缺失时 fail-fast', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.JWT_SECRET = process.env.JWT_SECRET;
    originalEnv.ENGINE_AUTH_TOKEN = process.env.ENGINE_AUTH_TOKEN;
    originalEnv.DATA_SERVICE_AUTH_TOKEN = process.env.DATA_SERVICE_AUTH_TOKEN;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it('JWT_SECRET 缺失时 requireSecret 直接 throw', () => {
    delete process.env.JWT_SECRET;
    expect(() => requireSecret('JWT_SECRET')).toThrow('JWT_SECRET is required');
  });

  it('ENGINE_AUTH_TOKEN 缺失时 requireSecret 直接 throw', () => {
    delete process.env.ENGINE_AUTH_TOKEN;
    expect(() => requireSecret('ENGINE_AUTH_TOKEN')).toThrow('ENGINE_AUTH_TOKEN is required');
  });

  it('DATA_SERVICE_AUTH_TOKEN 缺失时 requireSecret 直接 throw', () => {
    delete process.env.DATA_SERVICE_AUTH_TOKEN;
    expect(() => requireSecret('DATA_SERVICE_AUTH_TOKEN')).toThrow(
      'DATA_SERVICE_AUTH_TOKEN is required',
    );
  });

  it('所有 secret 已设置时 requireSecret 正常返回', () => {
    process.env.JWT_SECRET = originalEnv.JWT_SECRET || 'dev-only-jwt-secret-change-in-production';
    process.env.ENGINE_AUTH_TOKEN = originalEnv.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token';
    process.env.DATA_SERVICE_AUTH_TOKEN =
      originalEnv.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token';

    expect(requireSecret('JWT_SECRET')).toBeDefined();
    expect(requireSecret('ENGINE_AUTH_TOKEN')).toBeDefined();
    expect(requireSecret('DATA_SERVICE_AUTH_TOKEN')).toBeDefined();
  });
});