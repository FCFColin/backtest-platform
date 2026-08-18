import { describe, it, expect } from 'vitest';
import type { vi } from 'vitest';
import { postJson, type TestServer } from './expressApp.js';
import { withServer } from './serverLifecycle.js';

type MockFn = ReturnType<typeof vi.fn>;

export interface EngineCase {
  name: string;
  path: string;
  enginePath: string;
  errorCode: string;
  logOnError?: boolean;
  result: Record<string, unknown>;
  validBody: () => Record<string, unknown>;
  invalidBodies: Array<[string, Record<string, unknown>]>;
  specials?: Array<[string, (url: string, c: EngineCase) => Promise<void> | void]>;
}

export interface RouteTestMocks {
  callEngineStrict: MockFn;
  loggerError?: MockFn;
}

export interface RouteTestConfig {
  /** 返回 withServer 的 boot 函数，负责 mock 配置 + 启动服务 */
  startServer: (c: EngineCase) => () => Promise<TestServer>;
  unavailableError: new () => Error;
  mocks: () => RouteTestMocks;
}

export function describeEngineRouteTests(config: RouteTestConfig) {
  return (cases: EngineCase[]) =>
    describe.each(cases)('POST $path', (c) => {
      const getServer = withServer(config.startServer(c));
      const em = () => config.mocks();
      it('有效参数应调用引擎并返回 200', async () => {
        const { res, json } = await postJson(`${getServer().url}${c.path}`, c.validBody());
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(em().callEngineStrict).toHaveBeenCalledTimes(1);
        expect(em().callEngineStrict.mock.calls[0][0]).toBe(c.enginePath);
      });
      it('引擎抛错应返回 500', async () => {
        em().callEngineStrict.mockRejectedValue(new Error('engine boom'));
        const { res, json } = await postJson(`${getServer().url}${c.path}`, c.validBody());
        expect(res.status).toBe(500);
        expect(json.error.code).toBe(c.errorCode);
        if (c.logOnError) expect(em().loggerError).toHaveBeenCalled();
      });
      it('引擎不可用应 fail-closed 返回 503', async () => {
        em().callEngineStrict.mockRejectedValue(new config.unavailableError());
        const { res, json } = await postJson(`${getServer().url}${c.path}`, c.validBody());
        expect(res.status).toBe(503);
        expect(res.headers.get('retry-after')).toBe('30');
        expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
      });
      it.each(c.invalidBodies)('%s 应返回 400 且不调用引擎', async (_n, body) => {
        const { res } = await postJson(`${getServer().url}${c.path}`, body);
        expect(res.status).toBe(400);
        expect(em().callEngineStrict).not.toHaveBeenCalled();
      });
      if (c.specials?.length) {
        it.each(c.specials)('%s', async (_n, fn) => {
          await fn(`${getServer().url}${c.path}`, c);
        });
      }
    });
}

export interface SignalCase {
  path: string;
  data: Record<string, Record<string, number>>;
  engineResult: Record<string, unknown>;
  validReq: () => Record<string, unknown>;
  validation: Array<[string, () => Record<string, unknown>]>;
}

export interface SignalRouteMocks {
  callEngineStrict: MockFn;
  fetchHistoryData: MockFn;
}

export interface SignalRouteConfig {
  startServer: (c: SignalCase) => () => Promise<TestServer>;
  mocks: () => SignalRouteMocks;
}

export function describeSignalRouteTests(config: SignalRouteConfig) {
  return (cases: SignalCase[]) =>
    describe.each<SignalCase>(cases)('POST $path', (c) => {
      const getServer = withServer(config.startServer(c));
      const sm = () => config.mocks();
      it('有效参数应返回分析结果', async () => {
        const { res, json } = await postJson(`${getServer().url}${c.path}`, c.validReq());
        expect(res.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.data.signals).toHaveLength(1);
        expect(sm().callEngineStrict).toHaveBeenCalledTimes(1);
      });
      it.each(c.validation)('%s 应返回 400（zod 校验失败）', async (_n, getReq) => {
        const { res } = await postJson(`${getServer().url}${c.path}`, getReq());
        expect(res.status).toBe(400);
        expect(sm().callEngineStrict).not.toHaveBeenCalled();
      });
      it('价格数据缺失时应返回 404', async () => {
        sm().fetchHistoryData.mockResolvedValue({ data: { SPY: {} }, degraded: false });
        const { res, json } = await postJson(`${getServer().url}${c.path}`, c.validReq());
        expect(res.status).toBe(404);
        expect(json.error.code).toBe('DATA_NOT_FOUND');
      });
      it('引擎抛错时应返回 500', async () => {
        sm().callEngineStrict.mockRejectedValueOnce(new Error('signal engine error'));
        const { res } = await postJson(`${getServer().url}${c.path}`, c.validReq());
        expect(res.status).toBe(500);
      });
    });
}
