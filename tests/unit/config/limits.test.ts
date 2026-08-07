import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

vi.mock('../../../packages/backend/src/infrastructure/unleashClient.js', () => ({
  unleashClient: { isInitialized: false, isEnabled: vi.fn() },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

import {
  PLAN_LIMITS,
  USAGE_METRIC,
  PLAN_LIMIT_FLAGS,
  isEnabled,
  logFlagAccess,
} from '../../../packages/backend/src/config/limits.js';

describe('config/limits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PLAN_LIMITS 包含三个计划', () => {
    expect(PLAN_LIMITS.free.maxTickers).toBe(10);
    expect(PLAN_LIMITS.pro.maxTickers).toBe(50);
    expect(PLAN_LIMITS.enterprise.maxTickers).toBe(200);
  });

  it('enterprise backtestsPerMonth 为 Infinity', () => {
    expect(PLAN_LIMITS.enterprise.backtestsPerMonth).toBe(Infinity);
  });

  it('常量正确', () => {
    expect(USAGE_METRIC.BACKTEST).toBe('backtest');
    expect(PLAN_LIMIT_FLAGS.enterpriseQuota).toBe('plan.enterprise-quota');
    expect(PLAN_LIMIT_FLAGS.proAnalytics).toBe('plan.pro-analytics');
  });

  it('unleashClient 未初始化时 isEnabled 返回 false', () => {
    expect(isEnabled('any-flag')).toBe(false);
  });

  it('logFlagAccess 不抛错且记录日志', () => {
    expect(() => logFlagAccess('test-flag', { userId: 'u1' }, true)).not.toThrow();
    expect(loggerMocks.info).toHaveBeenCalled();
  });
});
