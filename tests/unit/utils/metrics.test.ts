/**
 * metrics 单元测试（Prometheus 指标）
 *
 * 企业理由：Prometheus 指标是 K8s 生态监控告警的基础，指标注册失败
 * 会导致告警缺失。测试覆盖：
 * - 指标对象正确导出（Gauge/Counter/Histogram）
 * - recordEngineCall 正确递增计数器
 * - recordEngineUnavailable 正确递增计数器并清洗 reason
 * - registerCircuitBreakerMetrics 注册事件回调
 * - registerSemaphoreMetrics 设置初始值
 * - resetMetrics / getPrometheusRegister 不抛错
 *
 * 权衡：不验证 Prometheus 文本格式输出（需集成 /metrics 端点）。
 */

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
  fallbackToNodeTotal,
  recordEngineCall,
  recordEngineUnavailable,
  registerCircuitBreakerMetrics,
  registerSemaphoreMetrics,
  resetMetrics,
  getPrometheusRegister,
} from '../../../packages/backend/src/utils/metrics.js';

describe('指标对象导出', () => {
  it('eventLoopLagSeconds 应为 Gauge 实例', () => {
    expect(eventLoopLagSeconds).toBeDefined();
    expect(typeof eventLoopLagSeconds.set).toBe('function');
  });

  it('circuitBreakerState 应为带 name 标签的 Gauge', () => {
    expect(circuitBreakerState).toBeDefined();
    expect(typeof circuitBreakerState.set).toBe('function');
  });

  it('dataServiceSemaphoreAvailable 应为 Gauge', () => {
    expect(dataServiceSemaphoreAvailable).toBeDefined();
    expect(typeof dataServiceSemaphoreAvailable.set).toBe('function');
  });

  it('dataServiceSemaphoreTotal 应为 Gauge', () => {
    expect(dataServiceSemaphoreTotal).toBeDefined();
    expect(typeof dataServiceSemaphoreTotal.set).toBe('function');
  });

  it('httpRequestDurationMicroseconds 应为 Histogram', () => {
    expect(httpRequestDurationMicroseconds).toBeDefined();
    expect(typeof httpRequestDurationMicroseconds.observe).toBe('function');
  });

  it('httpRequestsTotal 应为 Counter', () => {
    expect(httpRequestsTotal).toBeDefined();
    expect(typeof httpRequestsTotal.inc).toBe('function');
  });

  it('engineCallsTotal 应为带 result 标签的 Counter', () => {
    expect(engineCallsTotal).toBeDefined();
    expect(typeof engineCallsTotal.inc).toBe('function');
  });

  it('engineCallDuration 应为 Histogram', () => {
    expect(engineCallDuration).toBeDefined();
    expect(typeof engineCallDuration.observe).toBe('function');
  });

  it('fallbackToNodeTotal 应为带 reason 标签的 Counter', () => {
    expect(fallbackToNodeTotal).toBeDefined();
    expect(typeof fallbackToNodeTotal.inc).toBe('function');
  });
});

/** 读取带标签的计数器/Gauge 当前值；无匹配标签返回 undefined */
async function metricValue(
  metric: {
    get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>;
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

  it('success=true 应将 result=success 计数器递增到精确值', async () => {
    recordEngineCall(true);
    recordEngineCall(true);
    expect(await metricValue(engineCallsTotal, { result: 'success' })).toBe(2);
    // 不应误增 fallback 维度
    expect(await metricValue(engineCallsTotal, { result: 'unavailable' })).toBeUndefined();
  });

  it('success=false 应递增 result=unavailable 而非 success', async () => {
    recordEngineCall(false);
    expect(await metricValue(engineCallsTotal, { result: 'unavailable' })).toBe(1);
    expect(await metricValue(engineCallsTotal, { result: 'success' })).toBeUndefined();
  });

  it('success=false 且带 error 时应同时递增 fallbackToNodeTotal', async () => {
    recordEngineCall(false, 'engine_timeout');
    expect(await metricValue(engineCallsTotal, { result: 'unavailable' })).toBe(1);
    expect(await metricValue(fallbackToNodeTotal, { reason: 'engine_timeout' })).toBe(1);
  });

  it('error 含特殊字符时应被清洗为下划线后作为标签值', async () => {
    recordEngineCall(false, 'error: connection lost!');
    // 非 [a-zA-Z0-9_-] 字符（: 空格 !）逐一替换为 _
    expect(await metricValue(fallbackToNodeTotal, { reason: 'error__connection_lost_' })).toBe(1);
  });

  it('success=false 但 error 为空时不应产生任何 fallbackToNode 序列', async () => {
    recordEngineCall(false);
    const snapshot = await fallbackToNodeTotal.get();
    expect(snapshot.values).toHaveLength(0);
  });
});

describe('recordEngineUnavailable', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('应将 fallbackToNodeTotal 对应 reason 递增到精确值', async () => {
    recordEngineUnavailable('engine_down');
    recordEngineUnavailable('engine_down');
    recordEngineUnavailable('engine_down');
    expect(await metricValue(fallbackToNodeTotal, { reason: 'engine_down' })).toBe(3);
  });

  it('reason 含特殊字符时应被清洗为确定的标签值', async () => {
    recordEngineUnavailable('error: timeout (5000ms)');
    // ': ( )' 等字符替换为 _
    expect(await metricValue(fallbackToNodeTotal, { reason: 'error__timeout__5000ms_' })).toBe(1);
  });

  it('reason 含中文时应被整体清洗为下划线（防止标签基数爆炸/注入）', async () => {
    recordEngineUnavailable('引擎超时');
    // 4 个中文字符 → 4 个下划线
    expect(await metricValue(fallbackToNodeTotal, { reason: '____' })).toBe(1);
  });

  it('reason 为空字符串时应以空标签记录而非抛错', async () => {
    recordEngineUnavailable('');
    expect(await metricValue(fallbackToNodeTotal, { reason: '' })).toBe(1);
  });
});

describe('registerCircuitBreakerMetrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('应注册 open/halfOpen/close 事件回调并设置初始状态为 0', () => {
    const breaker = {
      on: vi.fn(),
    };
    registerCircuitBreakerMetrics('test-breaker', breaker as unknown as never);

    expect(breaker.on).toHaveBeenCalledWith('open', expect.any(Function));
    expect(breaker.on).toHaveBeenCalledWith('halfOpen', expect.any(Function));
    expect(breaker.on).toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('注册后初始状态应为 0（closed），open 回调应置为 1', async () => {
    const callbacks: Record<string, () => void> = {};
    const breaker = {
      on: vi.fn((event: string, cb: () => void) => {
        callbacks[event] = cb;
      }),
    };
    registerCircuitBreakerMetrics('cb-1', breaker as unknown as never);

    // 注册即设初始状态 closed=0
    expect(await metricValue(circuitBreakerState, { name: 'cb-1' })).toBe(0);
    callbacks.open();
    expect(await metricValue(circuitBreakerState, { name: 'cb-1' })).toBe(1);
  });

  it('halfOpen 回调应将状态置为 2', async () => {
    const callbacks: Record<string, () => void> = {};
    const breaker = {
      on: vi.fn((event: string, cb: () => void) => {
        callbacks[event] = cb;
      }),
    };
    registerCircuitBreakerMetrics('cb-2', breaker as unknown as never);

    callbacks.halfOpen();
    expect(await metricValue(circuitBreakerState, { name: 'cb-2' })).toBe(2);
  });

  it('open 后 close 回调应将状态复位为 0', async () => {
    const callbacks: Record<string, () => void> = {};
    const breaker = {
      on: vi.fn((event: string, cb: () => void) => {
        callbacks[event] = cb;
      }),
    };
    registerCircuitBreakerMetrics('cb-3', breaker as unknown as never);

    callbacks.open();
    expect(await metricValue(circuitBreakerState, { name: 'cb-3' })).toBe(1);
    callbacks.close();
    expect(await metricValue(circuitBreakerState, { name: 'cb-3' })).toBe(0);
  });
});

describe('registerSemaphoreMetrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('应将 total 与 available 初始值写入对应 Gauge', async () => {
    const getAvailable = vi.fn(() => 2);
    registerSemaphoreMetrics('sem-1', 3, getAvailable);
    expect(getAvailable).toHaveBeenCalled();
    expect(await metricValue(dataServiceSemaphoreTotal, { name: 'sem-1' })).toBe(3);
    expect(await metricValue(dataServiceSemaphoreAvailable, { name: 'sem-1' })).toBe(2);
  });

  it('available 为 0（饱和）时应如实记录 0 而非缺省', async () => {
    registerSemaphoreMetrics('sem-2', 3, () => 0);
    expect(await metricValue(dataServiceSemaphoreAvailable, { name: 'sem-2' })).toBe(0);
    expect(await metricValue(dataServiceSemaphoreTotal, { name: 'sem-2' })).toBe(3);
  });

  it('available 等于 total（完全空闲）时应记录满许可', async () => {
    registerSemaphoreMetrics('sem-3', 3, () => 3);
    expect(await metricValue(dataServiceSemaphoreAvailable, { name: 'sem-3' })).toBe(3);
  });
});

describe('resetMetrics', () => {
  it('应不抛错地重置所有指标', () => {
    expect(() => resetMetrics()).not.toThrow();
  });

  it('多次调用应幂等', () => {
    expect(() => {
      resetMetrics();
      resetMetrics();
      resetMetrics();
    }).not.toThrow();
  });
});

describe('getPrometheusRegister', () => {
  it('应返回 Registry 实例', () => {
    const register = getPrometheusRegister();
    expect(register).toBeDefined();
    expect(typeof register.metrics).toBe('function');
  });

  it('返回的 register 应支持 metrics() 方法生成 Prometheus 文本格式', async () => {
    const register = getPrometheusRegister();
    const metricsText = await register.metrics();
    expect(typeof metricsText).toBe('string');
    // 应包含已注册的指标名称
    expect(metricsText.length).toBeGreaterThan(0);
  });

  it('返回的 register 应支持 getMetricsAsJSON 方法', async () => {
    const register = getPrometheusRegister();
    const metrics = await register.getMetricsAsJSON();
    expect(Array.isArray(metrics)).toBe(true);
  });
});
