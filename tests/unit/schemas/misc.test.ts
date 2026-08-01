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
} from '../../../packages/backend/src/schemas/data.js';

describe('historyQuerySchema', () => {
  it('应接受合法查询', () => {
    const r = historyQuerySchema.safeParse({
      tickers: 'VTI,BND',
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    });
    expect(r.success).toBe(true);
  });

  it('startDate > endDate 应拒绝', () => {
    const r = historyQuerySchema.safeParse({
      tickers: 'VTI',
      startDate: '2024-12-31',
      endDate: '2020-01-01',
    });
    expect(r.success).toBe(false);
  });

  it('空 tickers 应拒绝', () => {
    const r = historyQuerySchema.safeParse({
      tickers: '',
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    });
    expect(r.success).toBe(false);
  });

  it('非法日期格式应拒绝', () => {
    const r = historyQuerySchema.safeParse({
      tickers: 'VTI',
      startDate: '01/01/2020',
      endDate: '2024-12-31',
    });
    expect(r.success).toBe(false);
  });
});

describe('searchQuerySchema', () => {
  it('应接受合法搜索词', () => {
    const r = searchQuerySchema.safeParse({ query: 'VTI' });
    expect(r.success).toBe(true);
  });

  it('空 query 应拒绝', () => {
    const r = searchQuerySchema.safeParse({ query: '' });
    expect(r.success).toBe(false);
  });

  it('超过 100 字符应拒绝', () => {
    const r = searchQuerySchema.safeParse({ query: 'a'.repeat(101) });
    expect(r.success).toBe(false);
  });

  it('可选 market 字段', () => {
    const r = searchQuerySchema.safeParse({ query: 'VTI', market: 'US' });
    expect(r.success).toBe(true);
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

  it('应接受合法请求', () => {
    expect(portfolioBodySchema.safeParse(valid).success).toBe(true);
  });

  it('空名称应拒绝', () => {
    const r = portfolioBodySchema.safeParse({ ...valid, name: '' });
    expect(r.success).toBe(false);
  });

  it('超过 120 字符名称应拒绝', () => {
    const r = portfolioBodySchema.safeParse({ ...valid, name: 'a'.repeat(121) });
    expect(r.success).toBe(false);
  });

  it('空资产列表应拒绝', () => {
    const r = portfolioBodySchema.safeParse({ ...valid, assets: [] });
    expect(r.success).toBe(false);
  });

  it('超过 200 资产应拒绝', () => {
    const r = portfolioBodySchema.safeParse({
      ...valid,
      assets: Array(201).fill({ ticker: 'VTI', weight: 0.5 }),
    });
    expect(r.success).toBe(false);
  });

  it('可选 rebalanceFrequency', () => {
    expect(portfolioBodySchema.safeParse({ ...valid, rebalanceFrequency: 'monthly' }).success).toBe(
      true,
    );
    expect(portfolioBodySchema.safeParse({ ...valid, rebalanceFrequency: 'invalid' }).success).toBe(
      false,
    );
  });

  it('负权重应拒绝', () => {
    const r = portfolioBodySchema.safeParse({ ...valid, assets: [{ ticker: 'VTI', weight: -1 }] });
    expect(r.success).toBe(false);
  });
});

describe('savedConfigBodySchema', () => {
  it('应接受合法请求', () => {
    const r = savedConfigBodySchema.safeParse({ name: 'My Config', config: { portfolios: [] } });
    expect(r.success).toBe(true);
  });

  it('空名称应拒绝', () => {
    const r = savedConfigBodySchema.safeParse({ name: '', config: {} });
    expect(r.success).toBe(false);
  });
});

describe('backtestRunBodySchema', () => {
  it('应接受仅 name + request', () => {
    const r = backtestRunBodySchema.safeParse({ name: 'run-1', request: { portfolios: [] } });
    expect(r.success).toBe(true);
  });

  it('可选字段', () => {
    const r = backtestRunBodySchema.safeParse({
      name: 'r',
      request: {},
      status: 'pending',
      result: {},
    });
    expect(r.success).toBe(true);
  });

  it('非法 status 应拒绝', () => {
    const r = backtestRunBodySchema.safeParse({ name: 'r', request: {}, status: 'invalid' });
    expect(r.success).toBe(false);
  });
});
