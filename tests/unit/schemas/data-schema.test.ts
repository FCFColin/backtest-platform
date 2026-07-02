import { describe, it, expect } from 'vitest';
import {
  historyQuerySchema,
  searchQuerySchema,
  cpiQuerySchema,
} from '../../../api/schemas/data.js';

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
