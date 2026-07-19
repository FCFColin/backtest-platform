/**
 * 引擎调用与降级单元测试
 *
 * 企业理由（ADR-008 / ADR-031）：Go 引擎是唯一主引擎，Rust 引擎已退役。
 * callEngineStrict 为 fail-closed（Go 不可用时抛 EngineUnavailableError）。
 * 本测试覆盖：
 * 1. Go 引擎可用时返回 Go 引擎结果
 * 2. callEngineStrict 在 Go 不可用时 fail-closed 抛出 EngineUnavailableError
 * 3. resetEngineAvailability
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
  recordEngineCall: vi.fn(),
  recordEngineUnavailable: vi.fn(),
  engineCallDuration: { observe: vi.fn() },
  registerCircuitBreakerMetrics: vi.fn(),
}));

// ===== Mock 模块 =====

vi.mock('opossum', () => ({
  default: vi.fn(() => cbMocks.factory()),
}));

vi.mock('../../../packages/backend/src/utils/httpClient.js', () => ({
  callService: callServiceMocks.callService,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    GO_ENGINE_URL: 'http://127.0.0.1:5004',
    ENGINE_AUTH_TOKEN: 'test-token',
    ENGINE_TIMEOUT_MS: 5000,
  }),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => metricsMocks);

import {
  callEngineStrict,
  resetEngineAvailability,
  EngineUnavailableError,
} from '../../../packages/backend/src/utils/engineClient.js';
import { UpstreamProblemError } from '../../../packages/backend/src/utils/errors.js';

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
    expect(metricsMocks.recordEngineCall).toHaveBeenCalledWith(true);
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
    expect(metricsMocks.recordEngineCall).toHaveBeenCalledWith(false, expect.any(String));
  });

  it('Go 引擎 4xx 应透传 UpstreamProblemError（不包装为 EngineUnavailableError）', async () => {
    const upstreamErr = new UpstreamProblemError(
      400,
      'BACKTEST_EMPTY_PORTFOLIOS',
      'Bad Request',
      'portfolios 不能为空',
    );
    cbMocks.goCB.fire.mockRejectedValue(upstreamErr);

    const promise = callEngineStrict('/api/engine/backtest', {});
    const catchPromise = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const error = await catchPromise;

    expect(error).toBe(upstreamErr);
    expect(error).toBeInstanceOf(UpstreamProblemError);
    expect(error).not.toBeInstanceOf(EngineUnavailableError);
    // 4xx 不应重试（参数错误重试无意义）
    expect(cbMocks.goCB.fire).toHaveBeenCalledTimes(1);
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
