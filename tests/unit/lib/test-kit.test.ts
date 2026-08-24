import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../packages/backend/src/utils/errors.js';
import {
  decodePayload,
  expectDegraded,
  expectOutboxWritten,
  expectProblem,
  mkApp,
  mkAuthedReq,
  mkEngineReq,
  mkPortfolio,
  reqJson,
  runAuthMatrix,
  runRouteCases,
  withServer,
  type ApiResult,
  type MkAppOptions,
} from '../../helpers/testKit/index.js';

function mountKitRoutes(configure?: MkAppOptions['configure']) {
  return withServer(() =>
    mkApp({
      configure: (app) => {
        app.get('/whoami', (rq, res) =>
          res.json({ success: true, data: { user: (rq as { user?: unknown }).user ?? null } }),
        );
        app.get('/echo-headers', (rq, res) => {
          const h = rq.headers as Record<string, string | undefined>;
          res.json({
            success: true,
            data: { auth: h.authorization ?? null, apiKey: h['x-api-key'] ?? null },
          });
        });
        app.post('/boom', () => {
          throw new ValidationError('invalid input');
        });
        configure?.(app);
      },
    }),
  );
}

const asData = <T>(body: unknown): T => (body as { data: T }).data;

describe('TestKit mkApp', () => {
  const getServer = mountKitRoutes();

  it('fake RBAC 默认注入 analyst 用户', async () => {
    const { body } = await reqJson(`${getServer().url}/whoami`, 'GET');
    expect(asData<{ user: { sub: string; role: string } }>(body).user).toEqual({
      sub: 'user-1',
      role: 'analyst',
    });
  });

  it('auth 覆盖默认用户', async () => {
    let seen: unknown;
    const s = await mkApp({
      auth: { user: { sub: 'u9', role: 'admin' } },
      configure: (app) =>
        app.get('/whoami', (rq, res) => {
          seen = (rq as { user?: unknown }).user;
          res.json({ success: true });
        }),
    });
    await reqJson(`${s.url}/whoami`, 'GET');
    expect(seen).toEqual({ sub: 'u9', role: 'admin' });
    await s.close();
  });

  it('ApplicationError → 生产级 RFC 9457 信封（status+type 同时断言）', async () => {
    const r = await reqJson(`${getServer().url}/boom`, 'POST', {});
    const api: ApiResult = { res: r.res, body: r.body };
    expectProblem(api, { status: 422, code: 'VALIDATION_ERROR', detailLike: 'invalid input' });
  });
});

describe('TestKit mkAuthedReq', () => {
  const getServer = mountKitRoutes();

  it('jwt 模式构造 Bearer 令牌且 payload 可解码', async () => {
    const { res, body } = await mkAuthedReq(getServer(), {
      path: '/echo-headers',
      sub: 'u7',
      role: 'admin',
    });
    expect(res.status).toBe(200);
    const d = asData<{ auth: string }>(body);
    expect(d.auth).toMatch(/^Bearer /);
    expect(decodePayload(d.auth.slice(7))).toMatchObject({ sub: 'u7', role: 'admin' });
  });

  it('apiKey 模式走 x-api-key 头', async () => {
    const { body } = await mkAuthedReq(getServer(), { path: '/echo-headers', apiKey: 'k-123' });
    expect(asData<{ apiKey: string }>(body).apiKey).toBe('k-123');
  });
});

describe('TestKit 断言器', () => {
  it('expectDegraded 两分支', () => {
    expectDegraded({ res: new Response(), body: { degraded: true } }, true);
    expect(() => expectDegraded({ res: new Response(), body: { success: true } }, true)).toThrow();
  });

  it('expectOutboxWritten 命中事件并校验 payload，未命中报错', () => {
    const query = vi.fn().mockResolvedValue({});
    query.mock.calls.push([
      'INSERT INTO outbox ...',
      ['backtest', 'b-1', 'backtest.completed', JSON.stringify({ tenantId: 't-1' }), null],
    ]);
    expectOutboxWritten(
      { query },
      { eventType: 'backtest.completed', payloadMatch: { tenantId: 't-1' } },
    );
    expect(() => expectOutboxWritten({ query }, { eventType: 'nope.event' })).toThrow(
      /未找到 event_type/,
    );
  });
});

describe('TestKit DSL', () => {
  const getServer = mountKitRoutes();

  runRouteCases(getServer, [
    { name: 'whoami 200', path: '/whoami', status: 200 },
    {
      name: 'boom 校验失败',
      method: 'POST',
      path: '/boom',
      body: {},
      status: 422,
      code: 'VALIDATION_ERROR',
    },
  ]);

  runAuthMatrix(getServer, {
    endpoint: '/whoami',
    cases: [
      { desc: '无认证头访问开放端点', expectedStatus: 200 },
      { desc: '带 admin JWT 访问', role: 'admin', sub: 'root', expectedStatus: 200 },
    ],
  });
});

describe('TestKit 工厂', () => {
  it('mkEngineReq 默认值集中 + 差异覆盖', () => {
    const req = mkEngineReq({
      parameters: { startingValue: 5000 },
      mcParams: { numSimulations: 10 },
    });
    expect(req.parameters).toMatchObject({ startingValue: 5000, benchmarkTicker: 'SPY' });
    expect(req.mcParams).toEqual({ numSimulations: 10 });
    expect((req.portfolio as { assets: unknown[] }).assets).toHaveLength(2);
    expect(mkPortfolio({ name: 'X' }).name).toBe('X');
  });
});
