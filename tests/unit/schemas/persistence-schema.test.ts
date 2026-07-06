import { describe, it, expect } from 'vitest';
import {
  portfolioBodySchema,
  savedConfigBodySchema,
  backtestRunBodySchema,
} from '../../../packages/backend/src/schemas/persistence.js';

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
