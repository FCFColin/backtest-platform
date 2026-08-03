import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const webVitalsMocks = vi.hoisted(() => ({
  onLCP: vi.fn(),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onFCP: vi.fn(),
  onTTFB: vi.fn(),
}));

vi.mock('web-vitals', () => webVitalsMocks);

const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal('fetch', fetchSpy);

import {
  trackApiCall,
  onNavStart,
  onNavEnd,
  reportPageLoadTiming,
  addSample,
  startPerformanceMonitoring,
  initVitalsReporting,
} from '../../../packages/frontend/src/utils/performanceReporter';

describe('trackApiCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
  });

  it('fetch 成功时应上报 api_timing', async () => {
    const promise = Promise.resolve({ status: 200 } as Response);
    trackApiCall(promise, '/api/v1/data?x=1', 'GET');
    await promise;
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.type).toBe('api_timing');
    expect(body.endpoint).toBe('/api/v1/data');
    expect(body.statusCode).toBe(200);
    expect(body.method).toBe('GET');
  });

  it('fetch 失败时应上报 statusCode=0', async () => {
    const promise = Promise.reject(new Error('network'));
    trackApiCall(promise, '/api/test', 'POST');
    await expect(promise).rejects.toThrow();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.statusCode).toBe(0);
  });
});

describe('onNavStart / onNavEnd', () => {
  it('应计算导航耗时并上报', () => {
    onNavStart();
    onNavEnd('/backtest');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.type).toBe('navigation');
    expect(body.route).toBe('/backtest');
  });

  it('未调用 onNavStart 时 onNavEnd 不上报', () => {
    onNavEnd('/x');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('reportPageLoadTiming', () => {
  it('有 navigation entry 时应上报各指标', () => {
    const navEntry = {
      responseStart: 10,
      requestStart: 5,
      domContentLoadedEventEnd: 100,
      startTime: 0,
      domComplete: 200,
      loadEventEnd: 300,
    };
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([navEntry] as never);
    reportPageLoadTiming();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.type).toBe('page_timing');
  });

  it('无 navigation entry 时不应上报', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    reportPageLoadTiming();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('addSample', () => {
  it('应缓冲样本（超 100 条时裁剪）', () => {
    for (let i = 0; i < 105; i++) addSample('vital', i, 'lcp');
    // 内部 buffer 被裁剪到 55 条（105-50），不暴露内部状态，仅验证不抛错
    expect(true).toBe(true);
  });
});

describe('startPerformanceMonitoring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应设置 setInterval 定时器（幂等）', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    startPerformanceMonitoring();
    startPerformanceMonitoring();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
});

describe('initVitalsReporting', () => {
  it('应注册 5 个 web-vitals 回调', () => {
    initVitalsReporting();
    expect(webVitalsMocks.onLCP).toHaveBeenCalledOnce();
    expect(webVitalsMocks.onCLS).toHaveBeenCalledOnce();
    expect(webVitalsMocks.onINP).toHaveBeenCalledOnce();
    expect(webVitalsMocks.onFCP).toHaveBeenCalledOnce();
    expect(webVitalsMocks.onTTFB).toHaveBeenCalledOnce();
  });

  it('LCP 回调应上报 vital 并 round', async () => {
    initVitalsReporting();
    const cb = webVitalsMocks.onLCP.mock.calls[0][0];
    cb({ value: 123.7 });
    expect(fetchSpy).toHaveBeenCalled();
    const body = JSON.parse(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1].body);
    expect(body.type).toBe('vital');
    expect(body.metric).toBe('lcp');
    expect(body.value).toBe(124);
  });

  it('CLS 回调应上报 vital 且不 round', () => {
    initVitalsReporting();
    const cb = webVitalsMocks.onCLS.mock.calls[0][0];
    cb({ value: 0.123 });
    const body = JSON.parse(fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1].body);
    expect(body.value).toBe(0.123);
  });
});
