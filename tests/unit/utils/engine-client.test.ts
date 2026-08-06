import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConfigMocks } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const cbMocks = vi.hoisted(() => {
  const goCB = {
    fire: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    opened: false,
  };
  return {
    goCB,
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
const metricsMocks = vi.hoisted(() => ({
  recordEngineCall: vi.fn(),
  recordEngineUnavailable: vi.fn(),
  engineCallDuration: { observe: vi.fn() },
  registerCircuitBreakerMetrics: vi.fn(),
}));

vi.mock('opossum', () => ({
  default: vi.fn(() => cbMocks.factory()),
}));

vi.mock('../../../packages/backend/src/utils/httpClient.js', () => ({
  callService: callServiceMocks.callService,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({
    GO_ENGINE_URL: 'http://127.0.0.1:15004',
    ENGINE_AUTH_TOKEN: 'test-token',
    ENGINE_TIMEOUT_MS: 5000,
  }),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => metricsMocks);

import CircuitBreakerDefault from 'opossum';
import { z } from 'zod';
import {
  callEngineStrict,
  resetEngineAvailability,
  EngineUnavailableError,
} from '../../../packages/backend/src/utils/engineClient.js';
import { UpstreamProblemError } from '../../../packages/backend/src/utils/errors.js';

// 在模块加载时捕获 callGoEngine（CircuitBreaker 构造器第一个参数）与熔断器事件回调，
const cbCtorMock = CircuitBreakerDefault as unknown as {
  mock: { calls: Array<Array<unknown>> };
};
const callGoEngine = cbCtorMock.mock.calls[0]?.[0] as
  ((endpoint: string, body: unknown) => Promise<unknown>) | undefined;

const cbOnMock = cbMocks.goCB.on as unknown as {
  mock: { calls: Array<[string, (...args: unknown[]) => void]> };
};
const cbEventHandlers: Record<string, (...args: unknown[]) => void> = {};
for (const [event, handler] of cbOnMock.mock.calls) {
  cbEventHandlers[event] = handler as (...args: unknown[]) => void;
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  const p = promise.catch((e) => e);
  await vi.runAllTimersAsync();
  return p as T;
}
describe('callEngineStrict（fail-closed）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it('Go 引擎可用时应返回 Go 引擎结果并记录成功指标', async () => {
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
    const error = await settle(callEngineStrict('/api/engine/backtest', {}));
    expect(error).toBeInstanceOf(EngineUnavailableError);
    expect(metricsMocks.recordEngineCall).toHaveBeenCalledWith(false, expect.any(String));
  });
  it('Go 引擎 4xx 应透传 UpstreamProblemError（不包装、不重试）', async () => {
    const upstreamErr = new UpstreamProblemError(
      400,
      'BACKTEST_EMPTY_PORTFOLIOS',
      'Bad Request',
      'portfolios 不能为空',
    );
    cbMocks.goCB.fire.mockRejectedValue(upstreamErr);
    const error = await settle(callEngineStrict('/api/engine/backtest', {}));
    expect(error).toBe(upstreamErr);
    expect(error).toBeInstanceOf(UpstreamProblemError);
    expect(error).not.toBeInstanceOf(EngineUnavailableError);
    expect(cbMocks.goCB.fire).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'responseSchema 校验成功时应返回解析后的数据',
      true,
      { portfolios: [{ ticker: 'AAPL' }], statistics: { cagr: 0.1 } },
    ],
    [
      'responseSchema 校验失败时应抛出 EngineUnavailableError（fail-closed，不降级）',
      false,
      { portfolios: 'not-an-array' },
    ],
  ])('%s', async (_n, valid, goResult) => {
    cbMocks.goCB.fire.mockResolvedValue(goResult);
    const schema = z.object({
      portfolios: z.array(z.object({ ticker: z.string() })),
      statistics: z.object({ cagr: z.number() }),
    });

    if (valid) {
      expect(await callEngineStrict('/api/engine/backtest', {}, schema)).toEqual(goResult);
    } else {
      const error = await settle(callEngineStrict('/api/engine/backtest', {}, schema));
      expect(error).toBeInstanceOf(EngineUnavailableError);
    }
  });
  it('非 Error 抛出物应被包装为 Error 后重试（lastError 兜底）', async () => {
    cbMocks.goCB.fire
      .mockImplementationOnce(async () => {
        throw 'connection reset';
      })
      .mockResolvedValueOnce({ ok: true });
    const result = await settle(callEngineStrict('/api/engine/backtest', {}));
    expect(result).toEqual({ ok: true });
    expect(cbMocks.goCB.fire).toHaveBeenCalledTimes(2);
  });
});
describe('callGoEngine（直接单元测试）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
  });
  it('callService 返回 null 时应抛出 "Go engine call failed" 错误', async () => {
    callServiceMocks.callService.mockResolvedValueOnce(null);
    await expect(callGoEngine!('/api/engine/backtest', { foo: 'bar' })).rejects.toThrow(
      'Go engine call failed: /api/engine/backtest',
    );
  });
  it('callService 返回非 null 时应原样返回结果并按配置发起请求', async () => {
    const goResult = { portfolios: [] };
    callServiceMocks.callService.mockResolvedValueOnce(goResult);
    const result = await callGoEngine!('/api/engine/backtest', { foo: 'bar' });
    expect(result).toBe(goResult);
    expect(callServiceMocks.callService).toHaveBeenCalledWith(
      'http://127.0.0.1:15004',
      '/api/engine/backtest',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engine-Auth': 'test-token',
        },
        body: JSON.stringify({ foo: 'bar' }),
      }),
      5000,
    );
  });
});
describe('熔断器事件回调', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cbMocks.reset();
  });

  it.each([
    ['open 事件应记录 engineUnavailable 指标', 'open', 'go_circuit_breaker_open'],
    ['fallback 事件应记录 engineUnavailable 指标', 'fallback', 'go_circuit_breaker_fallback'],
  ])('%s', (_n, event, reason) => {
    cbEventHandlers[event]();
    expect(metricsMocks.recordEngineUnavailable).toHaveBeenCalledWith(reason);
  });
  it('halfOpen 与 close 事件应仅记录日志（无指标副作用）', () => {
    cbEventHandlers.halfOpen();
    cbEventHandlers.close();
    expect(metricsMocks.recordEngineUnavailable).not.toHaveBeenCalled();
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
