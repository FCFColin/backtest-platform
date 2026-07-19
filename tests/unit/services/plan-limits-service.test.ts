import { describe, it, expect } from 'vitest';
import {
  getPlanLimits,
  currentPeriod,
} from '../../../packages/backend/src/services/planLimitsService.js';

describe('getPlanLimits', () => {
  it('free 计划应返回 100/月, 10 标的, 1 并发, 10/分钟', () => {
    const limits = getPlanLimits('free');
    expect(limits.backtestsPerMonth).toBe(100);
    expect(limits.maxTickers).toBe(10);
    expect(limits.asyncConcurrency).toBe(1);
    expect(limits.rateLimitPerMin).toBe(10);
  });

  it('pro 计划应返回 5000/月, 50 标的, 5 并发, 60/分钟', () => {
    const limits = getPlanLimits('pro');
    expect(limits.backtestsPerMonth).toBe(5000);
    expect(limits.maxTickers).toBe(50);
    expect(limits.asyncConcurrency).toBe(5);
    expect(limits.rateLimitPerMin).toBe(60);
  });

  it('enterprise 计划应返回 Infinity/月, 200 标的, 20 并发, 300/分钟', () => {
    const limits = getPlanLimits('enterprise');
    expect(limits.backtestsPerMonth).toBe(Number.POSITIVE_INFINITY);
    expect(limits.maxTickers).toBe(200);
    expect(limits.asyncConcurrency).toBe(20);
    expect(limits.rateLimitPerMin).toBe(300);
  });

  it('未知计划应回到 free（fail-safe）', () => {
    expect(getPlanLimits(null)).toBe(getPlanLimits('free'));
    expect(getPlanLimits(undefined)).toBe(getPlanLimits('free'));
    expect(getPlanLimits('unknown')).toBe(getPlanLimits('free'));
    expect(getPlanLimits('')).toBe(getPlanLimits('free'));
  });
});

describe('currentPeriod', () => {
  it('应返回 YYYY-MM 格式', () => {
    const period = currentPeriod(new Date('2026-06-15T12:00:00Z'));
    expect(period).toBe('2026-06');
  });

  it('1 月应补零', () => {
    const period = currentPeriod(new Date('2026-01-01T00:00:00Z'));
    expect(period).toBe('2026-01');
  });

  it('默认使用当前时间', () => {
    const period = currentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });
});
