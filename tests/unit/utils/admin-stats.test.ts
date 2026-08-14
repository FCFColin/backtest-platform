import { describe, it, expect } from 'vitest';
import {
  defaultParsedAdminStats,
  parseMarketBreakdown,
  parseAdminStats,
  type ServiceHealthView,
} from '../../../packages/frontend/src/utils/adminStats.js';

const byName = (services: ServiceHealthView[], name: string) =>
  services.find((s) => s.name === name)!;

describe('defaultParsedAdminStats', () => {
  it('应提供占位默认结构：Go 服务 down、Node 服务 healthy（管理接口宿主）', () => {
    const services = defaultParsedAdminStats.services;
    expect(byName(services, 'Go Engine').status).toBe('down');
    expect(byName(services, 'Go Data Service').status).toBe('down');
    expect(byName(services, 'Node Service').status).toBe('healthy');
    expect(defaultParsedAdminStats.dataStats).toEqual({
      totalTickers: 0,
      totalSizeMB: 0,
      earliestDate: '-',
      latestDate: '-',
      marketBreakdown: {},
    });
    expect(defaultParsedAdminStats.system).toEqual({ memoryMB: 0, uptime: '-' });
  });
});

describe('parseMarketBreakdown', () => {
  it('undefined / 空对象应返回空对象', () => {
    expect(parseMarketBreakdown(undefined)).toEqual({});
    expect(parseMarketBreakdown({})).toEqual({});
  });

  it('应兼容 stocks / count / total 三种字段命名，并跳过 null 与非对象值', () => {
    const result = parseMarketBreakdown({
      NYSE: { stocks: 100 },
      NASDAQ: { count: 50 },
      HKEX: { total: 30 },
      ZERO: { stocks: 0 },
      BAD_NULL: null,
      BAD_STR: 'not-an-object',
      BAD_NUM: 42,
    });
    expect(result).toEqual({
      NYSE: 100,
      NASDAQ: 50,
      HKEX: 30,
      ZERO: 0,
    });
  });
});

describe('parseAdminStats', () => {
  it('null / undefined 输入应返回与默认形态一致的结构', () => {
    const r = parseAdminStats(null);
    expect(byName(r.services, 'Go Engine').status).toBe('down');
    expect(byName(r.services, 'Go Data Service').status).toBe('down');
    expect(byName(r.services, 'Node Service').status).toBe('healthy');
    expect(r.dataStats).toEqual({
      totalTickers: 0,
      totalSizeMB: 0,
      earliestDate: '-',
      latestDate: '-',
      marketBreakdown: {},
    });
    expect(r.system).toEqual({ memoryMB: 0, uptime: '-' });
  });

  it('services 状态映射：healthy→healthy, unhealthy→degraded, 其他→down，并透传 latency/version/error', () => {
    const r = parseAdminStats({
      services: {
        go_engine: { status: 'healthy', latency_ms: 12, version: 'v1.0.0' },
        go_data_service: { status: 'unhealthy', error: 'timeout', latency_ms: 999 },
      },
    });
    expect(byName(r.services, 'Go Engine')).toMatchObject({
      status: 'healthy',
      latency: 12,
      version: 'v1.0.0',
    });
    expect(byName(r.services, 'Go Data Service')).toMatchObject({
      status: 'degraded',
      latency: 999,
      message: 'timeout',
    });

    const r2 = parseAdminStats({
      services: { go_engine: { status: 'unknown' } },
    });
    expect(byName(r2.services, 'Go Engine').status).toBe('down');
  });

  it('data_stats：total_tickers 优先于 universe_total，date_ranges 与 by_market 解析正确', () => {
    const r = parseAdminStats({
      data_stats: {
        total_tickers: 128,
        total_size_mb: 256.5,
        date_ranges: { earliest: '2010-01-01', latest: '2024-12-31' },
        by_market: { NYSE: { stocks: 80 }, NASDAQ: { count: 48 } },
      },
    });
    expect(r.dataStats.totalTickers).toBe(128);
    expect(r.dataStats.totalSizeMB).toBe(256.5);
    expect(r.dataStats.earliestDate).toBe('2010-01-01');
    expect(r.dataStats.latestDate).toBe('2024-12-31');
    expect(r.dataStats.marketBreakdown).toEqual({ NYSE: 80, NASDAQ: 48 });

    const r2 = parseAdminStats({ data_stats: { universe_total: 99 } });
    expect(r2.dataStats.totalTickers).toBe(99);
    const r3 = parseAdminStats({ data_stats: {} });
    expect(r3.dataStats.totalTickers).toBe(0);
  });

  it('system：memory.rss_mb 与 uptime_formatted 解析正确，缺失时降级', () => {
    const r = parseAdminStats({
      system: { memory: { rss_mb: 123.4 }, uptime_formatted: '3d 2h' },
    });
    expect(r.system.memoryMB).toBe(123.4);
    expect(r.system.uptime).toBe('3d 2h');

    const r2 = parseAdminStats({ system: {} });
    expect(r2.system.memoryMB).toBe(0);
    expect(r2.system.uptime).toBe('-');
  });
});
