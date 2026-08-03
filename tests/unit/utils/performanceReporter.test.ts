import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const vitalsMocks = vi.hoisted(() => ({
  onLCP: vi.fn(),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onFCP: vi.fn(),
  onTTFB: vi.fn(),
}));

const reportPerfMock = vi.hoisted(() => vi.fn());

vi.mock('web-vitals', () => vitalsMocks);
vi.mock('../../../packages/frontend/src/utils/errorReporter.js', () => ({
  reportPerformance: reportPerfMock,
}));

import * as webVitalsMod from 'web-vitals';
import {
  trackApiCall,
  onNavStart,
  onNavEnd,
  reportPageLoadTiming,
  initVitalsReporting,
} from '../../../packages/frontend/src/utils/performanceReporter';

describe('trackApiCall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetch 成功时应上报 api_timing', async () => {
    const promise = Promise.resolve({ status: 200 } as Response);
    trackApiCall(promise, '/api/v1/data?x=1', 'GET');
    await promise;
    await vi.waitFor(() => expect(reportPerfMock).toHaveBeenCalled());
    expect(reportPerfMock).toHaveBeenCalledWith(
      'api_timing',
      expect.objectContaining({
        endpoint: '/api/v1/data',
        statusCode: 200,
        method: 'GET',
      }),
    );
  });

  it('fetch 失败时应上报 statusCode=0', async () => {
    const promise = Promise.reject(new Error('network'));
    trackApiCall(promise, '/api/test', 'POST');
    await expect(promise).rejects.toThrow();
    await vi.waitFor(() => expect(reportPerfMock).toHaveBeenCalled());
    expect(reportPerfMock).toHaveBeenCalledWith(
      'api_timing',
      expect.objectContaining({ statusCode: 0 }),
    );
  });
});

describe('onNavStart / onNavEnd', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应计算导航耗时并上报', () => {
    onNavStart();
    onNavEnd('/backtest');
    expect(reportPerfMock).toHaveBeenCalledWith(
      'navigation',
      expect.objectContaining({ route: '/backtest' }),
    );
  });

  it('未调用 onNavStart 时 onNavEnd 不上报', () => {
    onNavEnd('/x');
    expect(reportPerfMock).not.toHaveBeenCalled();
  });
});

describe('reportPageLoadTiming', () => {
  afterEach(() => vi.restoreAllMocks());

  it('有 navigation entry 时应上报各指标', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      {
        responseStart: 10,
        requestStart: 5,
        domContentLoadedEventEnd: 100,
        startTime: 0,
        domComplete: 200,
        loadEventEnd: 300,
      },
    ] as never);
    reportPageLoadTiming();
    expect(reportPerfMock).toHaveBeenCalled();
  });

  it('无 navigation entry 时不应上报', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    reportPageLoadTiming();
    expect(reportPerfMock).not.toHaveBeenCalled();
  });
});

describe('initVitalsReporting', () => {
  it('web-vitals mock 验证', () => {
    expect(webVitalsMod.onLCP).toBeDefined();
    expect(webVitalsMod.onLCP).toBe(vitalsMocks.onLCP);
  });

  it('应注册 5 个 web-vitals 回调', () => {
    initVitalsReporting();
    expect(vitalsMocks.onLCP).toHaveBeenCalledOnce();
    expect(vitalsMocks.onCLS).toHaveBeenCalledOnce();
  });
});
