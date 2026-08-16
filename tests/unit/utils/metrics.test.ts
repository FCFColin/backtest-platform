import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  eventLoopLagSeconds,
  circuitBreakerState,
  dataServiceSemaphoreAvailable,
  dataServiceSemaphoreTotal,
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
  engineCallsTotal,
  engineCallDuration,
  engineUnavailableTotal,
  recordEngineCall,
  recordEngineUnavailable,
  registerCircuitBreakerMetrics,
  registerSemaphoreMetrics,
  resetMetrics,
  getPrometheusRegister,
  recordFrontendWebVital,
  recordFrontendApiCall,
  recordFrontendComponentRender,
  recordFrontendPageLoad,
} from '../../../packages/backend/src/utils/metrics.js';

describe('指标对象导出', () => {
  it.each<[string, unknown, string]>([
    ['eventLoopLagSeconds 应为 Gauge 实例', eventLoopLagSeconds, 'set'],
    ['circuitBreakerState 应为带 name 标签的 Gauge', circuitBreakerState, 'set'],
    ['dataServiceSemaphoreAvailable 应为 Gauge', dataServiceSemaphoreAvailable, 'set'],
    ['dataServiceSemaphoreTotal 应为 Gauge', dataServiceSemaphoreTotal, 'set'],
    ['httpRequestDurationMicroseconds 应为 Histogram', httpRequestDurationMicroseconds, 'observe'],
    ['httpRequestsTotal 应为 Counter', httpRequestsTotal, 'inc'],
    ['engineCallsTotal 应为带 result 标签的 Counter', engineCallsTotal, 'inc'],
    ['engineCallDuration 应为 Histogram', engineCallDuration, 'observe'],
    ['engineUnavailableTotal 应为带 reason 标签的 Counter', engineUnavailableTotal, 'inc'],
  ])('%s', (_n, metric, method) => {
    expect(metric).toBeDefined();
    expect(typeof (metric as Record<string, unknown>)[method]).toBe('function');
  });
});

async function metricValue(
  metric: {
    get: () => Promise<{
      values: Array<{ value: number; labels: Partial<Record<string, string | number>> }>;
    }>;
  },
  labels: Record<string, string>,
): Promise<number | undefined> {
  const snapshot = await metric.get();
  const match = snapshot.values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels[k] === val),
  );
  return match?.value;
}

describe('recordEngineCall', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('result=success 应将 result=success 计数器递增到精确值', async () => {
    recordEngineCall('success');
    recordEngineCall('success');
    expect(await metricValue(engineCallsTotal, { result: 'success' })).toBe(2);
    expect(await metricValue(engineCallsTotal, { result: 'unavailable' })).toBeUndefined();
  });

  it('result=unavailable 应递增 result=unavailable 而非 success', async () => {
    recordEngineCall('unavailable');
    expect(await metricValue(engineCallsTotal, { result: 'unavailable' })).toBe(1);
    expect(await metricValue(engineCallsTotal, { result: 'success' })).toBeUndefined();
  });

  it('result=unavailable 时应仅递增 engineCallsTotal（engineUnavailableTotal 由 recordEngineUnavailable 独立管理）', async () => {
    recordEngineCall('unavailable');
    expect(await metricValue(engineCallsTotal, { result: 'unavailable' })).toBe(1);
    // engineUnavailableTotal 不再由 recordEngineCall 管理，
    const snapshot = await engineUnavailableTotal.get();
    expect(snapshot.values).toHaveLength(0);
  });
});

describe('recordEngineUnavailable', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it.each<[string, string, number, string]>([
    ['应将 engineUnavailableTotal 对应 reason 递增到精确值', 'engine_down', 3, 'engine_down'],
    [
      'reason 含特殊字符时应被清洗为确定的标签值',
      'error: timeout (5000ms)',
      1,
      'error__timeout__5000ms_',
    ],
    ['reason 含中文时应被整体清洗为下划线（防止标签基数爆炸/注入）', '引擎超时', 1, '____'],
    ['reason 为空字符串时应以空标签记录而非抛错', '', 1, ''],
  ])('%s', async (_n, reason, times, expectedLabel) => {
    for (let i = 0; i < times; i++) recordEngineUnavailable(reason);
    expect(await metricValue(engineUnavailableTotal, { reason: expectedLabel })).toBe(times);
  });
});

describe('registerCircuitBreakerMetrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  function breakerWithCallbacks(name: string) {
    const callbacks: Record<string, () => void> = {};
    const breaker = {
      on: vi.fn((event: string, cb: () => void) => {
        callbacks[event] = cb;
      }),
    };
    registerCircuitBreakerMetrics(name, breaker as unknown as never);
    return callbacks;
  }

  it('应注册 open/halfOpen/close 事件回调并设置初始状态为 0（closed）', async () => {
    const breaker = { on: vi.fn() };
    registerCircuitBreakerMetrics('test-breaker', breaker as unknown as never);
    expect(breaker.on).toHaveBeenCalledWith('open', expect.any(Function));
    expect(breaker.on).toHaveBeenCalledWith('halfOpen', expect.any(Function));
    expect(breaker.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(await metricValue(circuitBreakerState, { name: 'test-breaker' })).toBe(0);
  });

  it.each<[string, string[], number]>([
    ['open 回调应将状态置为 1', ['open'], 1],
    ['halfOpen 回调应将状态置为 2', ['halfOpen'], 2],
    ['open 后 close 回调应将状态复位为 0', ['open', 'close'], 0],
  ])('%s', async (_n, events, expected) => {
    const callbacks = breakerWithCallbacks('cb-1');
    for (const e of events) callbacks[e]();
    expect(await metricValue(circuitBreakerState, { name: 'cb-1' })).toBe(expected);
  });
});

describe('registerSemaphoreMetrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it.each<[string, number, () => number, number]>([
    ['应将 total 与 available 初始值写入对应 Gauge', 3, () => 2, 2],
    ['available 为 0（饱和）时应如实记录 0 而非缺省', 3, () => 0, 0],
    ['available 等于 total（完全空闲）时应记录满许可', 3, () => 3, 3],
  ])('%s', async (_n, total, getAvailable, expectedAvailable) => {
    const spy = vi.fn(getAvailable);
    registerSemaphoreMetrics('sem-1', total, spy);
    expect(spy).toHaveBeenCalled();
    expect(await metricValue(dataServiceSemaphoreTotal, { name: 'sem-1' })).toBe(total);
    expect(await metricValue(dataServiceSemaphoreAvailable, { name: 'sem-1' })).toBe(
      expectedAvailable,
    );
  });
});

describe('resetMetrics', () => {
  it('应不抛错地重置所有指标且多次调用幂等', () => {
    expect(() => {
      resetMetrics();
      resetMetrics();
      resetMetrics();
    }).not.toThrow();
  });
});

describe('getPrometheusRegister', () => {
  it('应返回 Registry 实例，支持 metrics() 与 getMetricsAsJSON()', async () => {
    const register = getPrometheusRegister();
    expect(register).toBeDefined();
    expect(typeof register.metrics).toBe('function');
    const metricsText = await register.metrics();
    expect(typeof metricsText).toBe('string');
    expect(metricsText.length).toBeGreaterThan(0);
    const metrics = await register.getMetricsAsJSON();
    expect(Array.isArray(metrics)).toBe(true);
  });
});

function feMetric(name: string): {
  get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>;
} {
  const metric = getPrometheusRegister().getSingleMetric(name);
  if (!metric) throw new Error(`metric not found: ${name}`);
  return metric as never;
}

// /api/v1/errors 无认证入口：客户端可控 label 必须收敛，防 prometheus 高基数注入
describe('前端上报指标标签防护', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('webVital/pageLoad 白名单：未知 metric 不产生序列', async () => {
    recordFrontendWebVital('lcp', 2500);
    recordFrontendWebVital('attacker', 1);
    recordFrontendPageLoad('ttfb', 300);
    recordFrontendPageLoad('evil', 1);
    const vital = (await feMetric('frontend_web_vital').get()).values;
    const load = (await feMetric('frontend_page_load_seconds').get()).values;
    expect(vital.find((v) => v.labels.metric === 'lcp')?.value).toBe(2500);
    expect(vital.find((v) => v.labels.metric === 'attacker')).toBeUndefined();
    expect(load.find((v) => v.labels.le === '+Inf' && v.labels.metric === 'ttfb')?.value).toBe(1);
    expect(load.find((v) => v.labels.le === '+Inf' && v.labels.metric === 'evil')).toBeUndefined();
  });

  it('apiCall 归一化 endpoint：去 query、折叠 id 段', async () => {
    recordFrontendApiCall('/api/v1/backtest/portfolio?from=2020', 'POST', 200, 100);
    recordFrontendApiCall(
      'https://example.com/api/v1/orgs/members/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'DELETE',
      204,
      50,
    );
    const values = (await feMetric('frontend_api_call_duration_seconds').get()).values;
    expect(values.some((v) => v.labels.endpoint === '/api/v1/backtest/portfolio')).toBe(true);
    expect(values.some((v) => v.labels.endpoint === '/api/v1/orgs/members/:id')).toBe(true);
    expect(values.some((v) => v.labels.endpoint.includes('aaaaaaaa'))).toBe(false);
  });

  it('componentRender 未知 phase 归一化为 [other]', async () => {
    recordFrontendComponentRender('ChartView', 'update', 5);
    recordFrontendComponentRender('ChartView', 'evil-phase', 7);
    const values = (await feMetric('frontend_component_render_duration_seconds').get()).values;
    expect(
      values.some((v) => v.labels.component === 'ChartView' && v.labels.phase === 'update'),
    ).toBe(true);
    expect(
      values.some((v) => v.labels.component === 'ChartView' && v.labels.phase === '[other]'),
    ).toBe(true);
  });

  it('超过基数上限后新增 endpoint 并入 [other]', async () => {
    for (let i = 0; i < 300; i++) recordFrontendApiCall(`/attack/${i}`, 'POST', 200, 1);
    recordFrontendApiCall('/attack/overflow', 'POST', 200, 1);
    const endpoints = new Set(
      (await feMetric('frontend_api_call_duration_seconds').get()).values.map(
        (v) => v.labels.endpoint,
      ),
    );
    expect(endpoints.has('[other]')).toBe(true);
    expect(endpoints.has('/attack/overflow')).toBe(false);
    expect(endpoints.size).toBeLessThanOrEqual(301);
  });
});
