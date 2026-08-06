import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  loginPasswordSchema,
  registerSchema,
} from '../../../packages/backend/src/schemas/tactical.js';

describe('loginSchema', () => {
  it.each([
    ['合法 API Key', { apiKey: 'sk-abc123' }, true],
    ['空 API Key', { apiKey: '' }, false],
    ['超过 512 字符', { apiKey: 'a'.repeat(513) }, false],
  ])('%s 应 %s', (_n, data, shouldPass) => {
    expect(loginSchema.safeParse(data).success).toBe(shouldPass);
  });
});

describe('loginPasswordSchema', () => {
  it.each([
    ['合法凭据', { username: 'admin', password: 'secret123' }, true],
    ['空用户名', { username: '', password: 'secret123' }, false],
    ['空密码', { username: 'admin', password: '' }, false],
    ['用户名超 100 字符', { username: 'a'.repeat(101), password: 'secret' }, false],
    ['密码超 256 字符', { username: 'admin', password: 'a'.repeat(257) }, false],
  ])('%s 应 %s', (_n, data, shouldPass) => {
    expect(loginPasswordSchema.safeParse(data).success).toBe(shouldPass);
  });

  it('用户名前后空格应被 trim', () => {
    const r = loginPasswordSchema.safeParse({ username: '  admin  ', password: 'secret' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.username).toBe('admin');
  });
});

describe('registerSchema', () => {
  const valid = { username: 'newuser', email: 'user@example.com', password: 'password123' };

  it.each([
    ['合法注册', valid, true],
    ['用户名少于 2 字符', { ...valid, username: 'a' }, false],
    ['用户名超 50 字符', { ...valid, username: 'a'.repeat(51) }, false],
    ['邮箱格式不正确', { ...valid, email: 'not-an-email' }, false],
    ['密码少于 6 字符', { ...valid, password: '12345' }, false],
    ['密码超 256 字符', { ...valid, password: 'a'.repeat(257) }, false],
    ['邮箱超 254 字符', { ...valid, email: `${'a'.repeat(249)}@b.com` }, false],
  ])('%s 应 %s', (_n, data, shouldPass) => {
    expect(registerSchema.safeParse(data).success).toBe(shouldPass);
  });

  it('邮箱应转为小写', () => {
    const r = registerSchema.safeParse({ ...valid, email: 'User@Example.COM' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@example.com');
  });

  it('orgName 为可选', () => {
    const r = registerSchema.safeParse({ ...valid, orgName: 'My Org' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.orgName).toBe('My Org');
  });
});

import { describe, it, expect } from 'vitest';
import {
  historyQuerySchema,
  searchQuerySchema,
  cpiQuerySchema,
} from '../../../packages/backend/src/schemas/analysisSchemas.js';

describe('historyQuerySchema', () => {
  it.each([
    [
      '应接受合法查询',
      { tickers: 'VTI,BND', startDate: '2020-01-01', endDate: '2024-12-31' },
      true,
    ],
    [
      'startDate > endDate 应拒绝',
      { tickers: 'VTI', startDate: '2024-12-31', endDate: '2020-01-01' },
      false,
    ],
    ['空 tickers 应拒绝', { tickers: '', startDate: '2020-01-01', endDate: '2024-12-31' }, false],
    [
      '非法日期格式应拒绝',
      { tickers: 'VTI', startDate: '01/01/2020', endDate: '2024-12-31' },
      false,
    ],
  ])('%s', (label, data, shouldPass) => {
    expect(historyQuerySchema.safeParse(data).success).toBe(shouldPass);
  });
});

describe('searchQuerySchema', () => {
  it.each([
    ['应接受合法搜索词', { query: 'VTI' }, true],
    ['空 query 应拒绝', { query: '' }, false],
    ['超过 100 字符应拒绝', { query: 'a'.repeat(101) }, false],
    ['可选 market 字段', { query: 'VTI', market: 'US' }, true],
  ])('%s', (label, data, shouldPass) => {
    expect(searchQuerySchema.safeParse(data).success).toBe(shouldPass);
  });
});

describe('cpiQuerySchema', () => {
  it('所有字段可选', () => {
    const r = cpiQuerySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('country 仅接受 us/cn/US/CN', () => {
    expect(cpiQuerySchema.safeParse({ country: 'us' }).success).toBe(true);
    expect(cpiQuerySchema.safeParse({ country: 'cn' }).success).toBe(true);
    expect(cpiQuerySchema.safeParse({ country: 'jp' }).success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  portfolioBodySchema,
  savedConfigBodySchema,
  backtestRunBodySchema,
} from '../../../packages/backend/src/schemas/backtest.js';

describe('portfolioBodySchema', () => {
  const valid = { name: 'My Portfolio', assets: [{ ticker: 'VTI', weight: 60 }] };

  it.each([
    ['应接受合法请求', {}, true],
    ['空名称应拒绝', { name: '' }, false],
    ['超过 120 字符名称应拒绝', { name: 'a'.repeat(121) }, false],
    ['空资产列表应拒绝', { assets: [] }, false],
    ['超过 200 资产应拒绝', { assets: Array(201).fill({ ticker: 'VTI', weight: 0.5 }) }, false],
    ['负权重应拒绝', { assets: [{ ticker: 'VTI', weight: -1 }] }, false],
  ])('%s', (label, patch, shouldPass) => {
    const r = portfolioBodySchema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(shouldPass);
  });

  it('可选 rebalanceFrequency', () => {
    expect(portfolioBodySchema.safeParse({ ...valid, rebalanceFrequency: 'monthly' }).success).toBe(
      true,
    );
    expect(portfolioBodySchema.safeParse({ ...valid, rebalanceFrequency: 'invalid' }).success).toBe(
      false,
    );
  });
});

describe('savedConfigBodySchema', () => {
  it.each([
    ['应接受合法请求', { name: 'My Config', config: { portfolios: [] } }, true],
    ['空名称应拒绝', { name: '', config: {} }, false],
  ])('%s', (label, data, shouldPass) => {
    expect(savedConfigBodySchema.safeParse(data).success).toBe(shouldPass);
  });
});

describe('backtestRunBodySchema', () => {
  it.each([
    ['应接受仅 name + request', { name: 'run-1', request: { portfolios: [] } }, true],
    ['可选字段', { name: 'r', request: {}, status: 'pending', result: {} }, true],
    ['非法 status 应拒绝', { name: 'r', request: {}, status: 'invalid' }, false],
  ])('%s', (label, data, shouldPass) => {
    expect(backtestRunBodySchema.safeParse(data).success).toBe(shouldPass);
  });
});
