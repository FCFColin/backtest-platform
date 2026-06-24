/**
 * RustFallback 单元测试（Task 11）
 *
 * 企业理由：callRustWithFallback 是引擎降级链路的核心（ADR-008），
 * 必须保证：
 * 1. Go 引擎可用时使用 Go 引擎结果（主引擎优先）
 * 2. Go 引擎不可用时降级到 Rust 引擎（二级回退）
 * 3. Go 和 Rust 都不可用时降级到 Node.js 备用引擎（返回 DegradedResponse）
 * 4. fallbackFn 抛错时错误正确传播
 * 5. unwrapFallbackResult 正确解包降级响应
 * 6. isDegradedResponse 类型守卫正确判断
 *
 * 权衡：mock opossum CircuitBreaker 与 callService，不验证真实 HTTP 行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== vi.hoisted =====
const cbMocks = vi.hoisted(() => {
  let count = 0;
  const goCB = {
    fire: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    opened: false,
  };
  const rustCB = {
    fire: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    opened: false,
  };
  return {
    goCB,
    rustCB,
    factory: () => {
      count++;
      return count === 1 ? goCB : rustCB;
    },
    reset: () => {
      count = 0;
      goCB.fire.mockReset();
      rustCB.fire.mockReset();
      goCB.opened = false;
      rustCB.opened = false;
    },
  };
});

const callServiceMocks = vi.hoisted(() => ({
  callService: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  GO_ENGINE_URL: 'http://127.0.0.1:5002',
  RUST_ENGINE_URL: 'http://127.0.0.1:5002',
  ENGINE_AUTH_TOKEN: 'test-token',
  RUST_ENGINE_TIMEOUT_MS: 5000,
}));

const metricsMocks = vi.hoisted(() => ({
  recordRustCall: vi.fn(),
  recordFallbackToNode: vi.fn(),
  rustEngineCallDuration: { observe: vi.fn() },
  registerCircuitBreakerMetrics: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('opossum', () => ({
  default: vi.fn(() => cbMocks.factory()),
}));

vi.mock('../../../api/routes/dataRoutes.js', () => ({
  callService: callServiceMocks.callService,
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    error: loggerMocks.error,
    debug: loggerMocks.debug,
  },
}));

vi.mock('../../../api/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('../../../api/utils/metrics.js', () => metricsMocks);

import {
  callRustWithFallback,
  unwrapFallbackResult,
  isDegradedResponse,
  resetRustAvailability,
  callGoEngineDirect,
  type DegradedResponse,
} from '../../../api/utils/rustFallback.js';

describe('callRustWithFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Go 引擎可用时应返回 Go 引擎结果（主引擎优先）', async () => {
    const goResult = { portfolios: [], statistics: { cagr: 0.1 } };
    cbMocks.goCB.fire.mockResolvedValue(goResult);

    const result = await callRustWithFallback('/api/engine/backtest', { test: true }, () => 'fallback');

    expect(result).toEqual(goResult);
    // 不应调用 Rust 引擎
    expect(cbMocks.rustCB.fire).not.toHaveBeenCalled();
    // 不应调用 fallback
    // 应记录成功指标
    expect(metricsMocks.recordRustCall).toHaveBeenCalledWith(true);
  });

  it('Go 引擎不可用时应降级到 Rust 引擎', async () => {
    const rustResult = { portfolios: [], statistics: { cagr: 0.08 } };
    cbMocks.goCB.fire.mockImplementation(async () => { throw new Error('go engine down'); });
    cbMocks.rustCB.fire.mockResolvedValue(rustResult);

    const promise = callRustWithFallback('/api/engine/backtest', {}, () => 'fallback');
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual(rustResult);
    // 应调用 Rust 引擎
    expect(cbMocks.rustCB.fire).toHaveBeenCalled();
    // 应记录 warn 日志（Go 不可用）
    expect(loggerMocks.warn).toHaveBeenCalled();
  });

  it('Go 和 Rust 都不可用时应降级到 Node.js 备用引擎', async () => {
    cbMocks.goCB.fire.mockImplementation(async () => { throw new Error('go down'); });
    cbMocks.rustCB.fire.mockImplementation(async () => { throw new Error('rust down'); });

    const promise = callRustWithFallback('/api/engine/backtest', {}, () => 'node-fallback-result');
    await vi.runAllTimersAsync();
    const result = await promise;

    // 应返回 DegradedResponse
    expect(isDegradedResponse(result)).toBe(true);
    const degraded = result as DegradedResponse<string>;
    expect(degraded.data).toBe('node-fallback-result');
    expect(degraded.degraded).toBe(true);
    expect(degraded.degradedCode).toBe('ENGINE_UNAVAILABLE');
    expect(degraded.degradedMessage).toContain('Node.js');
    // 应记录降级指标
    expect(metricsMocks.recordRustCall).toHaveBeenCalledWith(false, expect.any(String));
  });

  it('fallbackFn 抛错时错误应正确传播', async () => {
    cbMocks.goCB.fire.mockImplementation(async () => { throw new Error('go down'); });
    cbMocks.rustCB.fire.mockImplementation(async () => { throw new Error('rust down'); });

    const fallbackError = new Error('node engine boom');
    const promise = callRustWithFallback('/api/engine/backtest', {}, () => {
      throw fallbackError;
    });
    // 立即附加 catch 防止 unhandled rejection（rejection 发生在 runAllTimersAsync 期间）
    const catchPromise = promise.catch(e => e);
    await vi.runAllTimersAsync();
    const error = await catchPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('node engine boom');
  });

  it('Go 引擎成功时不应调用 Rust 引擎和 fallback', async () => {
    cbMocks.goCB.fire.mockResolvedValue({ success: true });

    const fallbackSpy = vi.fn(() => 'fallback');
    await callRustWithFallback('/test', {}, fallbackSpy);

    expect(cbMocks.rustCB.fire).not.toHaveBeenCalled();
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('应通过熔断器调用 Go 引擎（不直接调用 callService）', async () => {
    cbMocks.goCB.fire.mockResolvedValue({ data: 'ok' });

    await callRustWithFallback('/api/engine/backtest', { portfolios: [] }, () => 'fb');

    // 应通过 goCircuitBreaker.fire 调用，而非直接调用 callService
    expect(cbMocks.goCB.fire).toHaveBeenCalledWith('/api/engine/backtest', { portfolios: [] });
  });

  it('降级响应应包含正确的 degradedCode 和 degradedMessage', async () => {
    cbMocks.goCB.fire.mockImplementation(async () => { throw new Error('go down'); });
    cbMocks.rustCB.fire.mockImplementation(async () => { throw new Error('rust down'); });

    const promise = callRustWithFallback('/test', {}, () => 42);
    await vi.runAllTimersAsync();
    const result = await promise;

    const degraded = result as DegradedResponse<number>;
    expect(degraded.degradedCode).toBe('ENGINE_UNAVAILABLE');
    expect(degraded.degradedMessage).toContain('降级');
    expect(degraded.degradedMessage).toContain('Node.js');
  });
});

describe('isDegradedResponse', () => {
  it('应识别 DegradedResponse 对象', () => {
    const degraded: DegradedResponse<string> = {
      data: 'test',
      degraded: true,
      degradedCode: 'ENGINE_UNAVAILABLE',
      degradedMessage: 'degraded',
    };
    expect(isDegradedResponse(degraded)).toBe(true);
  });

  it('应拒绝普通对象（degraded 非 true）', () => {
    expect(isDegradedResponse({ data: 'test', degraded: false })).toBe(false);
  });

  it('应拒绝不含 degraded 字段的对象', () => {
    expect(isDegradedResponse({ data: 'test' })).toBe(false);
  });

  it('应拒绝 null 和原始值', () => {
    expect(isDegradedResponse(null)).toBe(false);
    expect(isDegradedResponse(undefined)).toBe(false);
    expect(isDegradedResponse('string')).toBe(false);
    expect(isDegradedResponse(42)).toBe(false);
  });
});

describe('unwrapFallbackResult', () => {
  it('应解包 DegradedResponse（degraded=true）', () => {
    const degraded: DegradedResponse<string> = {
      data: 'result',
      degraded: true,
      degradedCode: 'ENGINE_UNAVAILABLE',
      degradedMessage: 'degraded msg',
    };

    const unwrapped = unwrapFallbackResult(degraded);

    expect(unwrapped.data).toBe('result');
    expect(unwrapped.degraded).toBe(true);
    expect(unwrapped.degradedCode).toBe('ENGINE_UNAVAILABLE');
    expect(unwrapped.degradedMessage).toBe('degraded msg');
  });

  it('应原样返回非降级响应（degraded=false）', () => {
    const normalResult = { portfolios: [], cagr: 0.1 };

    const unwrapped = unwrapFallbackResult(normalResult);

    expect(unwrapped.data).toEqual({ portfolios: [], cagr: 0.1 });
    expect(unwrapped.degraded).toBe(false);
    expect(unwrapped.degradedCode).toBeUndefined();
    expect(unwrapped.degradedMessage).toBeUndefined();
  });

  it('应正确处理原始值类型', () => {
    const unwrapped = unwrapFallbackResult(42);

    expect(unwrapped.data).toBe(42);
    expect(unwrapped.degraded).toBe(false);
  });
});

describe('resetRustAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
  });

  it('应关闭 Go 和 Rust 两个熔断器', () => {
    resetRustAvailability();

    expect(cbMocks.goCB.close).toHaveBeenCalled();
    expect(cbMocks.rustCB.close).toHaveBeenCalled();
  });
});

describe('callGoEngineDirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应通过熔断器调用 Go 引擎并返回结果', async () => {
    const goResult = { data: 'ok' };
    cbMocks.goCB.fire.mockResolvedValue(goResult);

    const result = await callGoEngineDirect('/api/engine/health', { test: true });

    expect(result).toEqual(goResult);
    expect(cbMocks.goCB.fire).toHaveBeenCalledWith('/api/engine/health', { test: true });
  });

  it('Go 引擎失败且重试耗尽时应抛出错误', async () => {
    cbMocks.goCB.fire.mockImplementation(async () => { throw new Error('go engine unavailable'); });

    const promise = callGoEngineDirect('/api/engine/health', {});
    // 立即附加 catch 防止 unhandled rejection（rejection 发生在 runAllTimersAsync 期间）
    const catchPromise = promise.catch(e => e);
    await vi.runAllTimersAsync();
    const error = await catchPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('go engine unavailable');
  });
});
