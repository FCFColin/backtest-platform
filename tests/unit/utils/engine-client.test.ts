/**
 * 引擎调用与降级单元测试
 *
 * 企业理由（ADR-008 / ADR-031）：Go 引擎是唯一主引擎，Rust 引擎已退役。
 * callEngineStrict 为 fail-closed（Go 不可用时抛 EngineUnavailableError）。
 * 本测试覆盖：
 * 1. Go 引擎可用时返回 Go 引擎结果
 * 2. callEngineStrict 在 Go 不可用时 fail-closed 抛出 EngineUnavailableError
 * 3. isDegradedResponse / unwrapFallbackResult / resetEngineAvailability / callGoEngineDirect
 *
 * 权衡：mock opossum CircuitBreaker 与 callService，不验证真实 HTTP 行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

// ===== vi.hoisted =====
const cbMocks = vi.hoisted(() => {
  const goCB = {
    fire: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    opened: false,
  };
  return {
    goCB,
    // 单引擎：每次 new CircuitBreaker 都返回同一个 goCB
    factory: () => goCB,
    reset: () => {
      goCB.fire.mockReset();
      goCB.opened = false;
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
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
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

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

vi.mock('../../../api/config/index.js', () => ({
  config: createConfigMocks({
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
    ENGINE_AUTH_TOKEN: 'test-token',
    ENGINE_TIMEOUT_MS: 5000,
  }),
}));

vi.mock('../../../api/utils/metrics.js', () => metricsMocks);

import {
  callEngineStrict,
  unwrapFallbackResult,
  isDegradedResponse,
  resetEngineAvailability,
  callGoEngineDirect,
  EngineUnavailableError,
  type DegradedResponse,
} from '../../../api/utils/engineClient.js';

describe('callEngineStrict（fail-closed）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Go 引擎可用时应返回 Go 引擎结果', async () => {
    const goResult = { portfolios: [], statistics: { cagr: 0.1 } };
    cbMocks.goCB.fire.mockResolvedValue(goResult);

    const result = await callEngineStrict('/api/engine/backtest', { test: true });

    expect(result).toEqual(goResult);
    expect(cbMocks.goCB.fire).toHaveBeenCalledWith('/api/engine/backtest', { test: true });
    expect(metricsMocks.recordRustCall).toHaveBeenCalledWith(true);
  });

  it('Go 引擎不可用时应 fail-closed 抛出 EngineUnavailableError', async () => {
    cbMocks.goCB.fire.mockImplementation(async () => {
      throw new Error('go down');
    });

    const promise = callEngineStrict('/api/engine/backtest', {});
    const catchPromise = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await catchPromise;

    expect(error).toBeInstanceOf(EngineUnavailableError);
    expect(metricsMocks.recordRustCall).toHaveBeenCalledWith(false, expect.any(String));
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

describe('resetEngineAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
  });

  it('应关闭 Go 引擎熔断器', () => {
    resetEngineAvailability();

    expect(cbMocks.goCB.close).toHaveBeenCalled();
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
    cbMocks.goCB.fire.mockImplementation(async () => {
      throw new Error('go engine unavailable');
    });

    const promise = callGoEngineDirect('/api/engine/health', {});
    const catchPromise = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await catchPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('go engine unavailable');
  });
});
