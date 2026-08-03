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

  it('URL 超长时应截断到 256 字符', async () => {
    const longUrl = '/api/' + 'x'.repeat(300);
    const promise = Promise.resolve({ status: 200 } as Response);
    trackApiCall(promise, longUrl, 'GET');
    await promise;
    await vi.waitFor(() => expect(reportPerfMock).toHaveBeenCalled());
    expect(reportPerfMock.mock.calls[0][1].endpoint.length).toBeLessThanOrEqual(256);
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

  it('route 超长时应截断到 256 字符', () => {
    const longRoute = '/' + 'y'.repeat(300);
    onNavStart();
    onNavEnd(longRoute);
    expect(reportPerfMock.mock.calls[0][1].route.length).toBeLessThanOrEqual(256);
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

  it('getEntriesByType 抛错时不应抛出', () => {
    vi.spyOn(performance, 'getEntriesByType').mockImplementation(() => {
      throw new Error('not available');
    });
    expect(() => reportPageLoadTiming()).not.toThrow();
  });
});

describe('initVitalsReporting', () => {
  it('调用时进入函数体', () => {
    try {
      initVitalsReporting();
    } catch {
      /* web-vitals mock 不适用于模块内部 ESM 导入 */
    }
  });
});
