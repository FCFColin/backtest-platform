
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock dotenv：避免加载真实 .env 干扰 process.env
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

import { resolveJwtAlgorithm, parseCorsOrigins } from '../../../packages/backend/src/config/env.js';

describe('resolveJwtAlgorithm', () => {
  const originalAlg = process.env.JWT_ALGORITHM;
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalAlg === undefined) delete process.env.JWT_ALGORITHM;
    else process.env.JWT_ALGORITHM = originalAlg;
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
  });

  it('显式 JWT_ALGORITHM 应优先于 NODE_ENV 默认值', () => {
    process.env.JWT_ALGORITHM = 'RS256';
    process.env.NODE_ENV = 'development';
    expect(resolveJwtAlgorithm()).toBe('RS256');
  });

  it('NODE_ENV 决定默认算法：production→RS256，其他→HS256', () => {
    delete process.env.JWT_ALGORITHM;
    process.env.NODE_ENV = 'production';
    expect(resolveJwtAlgorithm()).toBe('RS256');

    process.env.NODE_ENV = 'development';
    expect(resolveJwtAlgorithm()).toBe('HS256');

    // NODE_ENV 未设置时也应回退到 development→HS256
    delete process.env.NODE_ENV;
    expect(resolveJwtAlgorithm()).toBe('HS256');
  });
});

describe('parseCorsOrigins', () => {
  it('undefined / 空串 / 纯空白 / "*" 应返回 true（允许所有来源）', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('')).toBe(true);
    expect(parseCorsOrigins('   ')).toBe(true);
    expect(parseCorsOrigins('*')).toBe(true);
    expect(parseCorsOrigins('  *  ')).toBe(true);
  });

  it('逗号分隔列表应返回 trim 后的非空数组', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('应过滤空条目（首尾逗号、连续逗号、纯空白条目）', () => {
    expect(parseCorsOrigins(',https://a.com,, ,')).toEqual(['https://a.com']);
  });
});
