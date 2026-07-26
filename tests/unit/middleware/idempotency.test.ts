/**
 * 幂等性 Key 中间件单元测试（T-P1-5.3 / ADR-045）
 *
 * 企业理由：幂等性中间件保护写操作不被重复执行，是 API 可靠性的关键保障。
 * 测试覆盖：非 POST 放行、无 Key 放行、Key 命中缓存、Key 首次请求缓存写入、
 * 超长 Key 拒绝、失败响应不缓存、Redis 成功路径、安全攻击用例。
 *
 * ADR-045：删除内存回退路径。Redis 不可用时返回 503 + Retry-After（fail-closed），
 * 不再降级到进程内 Map（跨 Pod 不一致会导致重复写入）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { createMockRequest, createMockResponse } from '../../helpers/expressMocks.js';
import { createLoggerMocks, createRedisModuleMock } from '../../helpers/mockFactories.js';
import {
  createIdempotencyReqRes,
  mockLongIdempotencyKey,
  SQL_INJECTION_KEY,
  XSS_KEY,
  NEWLINE_INJECTION_KEY,
} from '../../helpers/idempotencyFixtures.js';

// Mock logger 以避免 OTel/pino 初始化副作用
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

// Mock appRedis：默认 Redis 成功（内存 Map 支撑的 store 模拟）；可切换为不可用
const redisMocks = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    { withStore: true, withHandlers: true, withMemoryHelpers: true },
    redisMocks,
  ),
);

// ADR-045：默认 Redis 可用（业务逻辑测试）。fail-closed 行为在独立 describe 中验证。
redisMocks.useRedisSuccess();

import { idempotencyKey } from '../../../packages/backend/src/middleware/idempotency.js';

/** 创建无 idempotency-key 头的 mock 三件套（用于放行路径测试） */
function createMockReqResWithoutKey(method = 'POST') {
  const req = createMockRequest({
    method,
    headers: {},
    path: '/api/test',
    url: '/api/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = { ...createMockResponse(), on: vi.fn() } as unknown as Response;
  return { req, res, next: vi.fn() };
}

describe('idempotencyKey 中间件（放行与校验）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('非 POST 请求应直接放行', () => {
    const { req, res, next } = createMockReqResWithoutKey('GET');
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('无 Idempotency-Key 头应直接放行', () => {
    const { req, res, next } = createMockReqResWithoutKey('POST');
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('超长 Key（>128 字符）应返回 400', () => {
    const { req, res, next } = createIdempotencyReqRes(mockLongIdempotencyKey());
    idempotencyKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('idempotencyKey 缓存行为（Redis 模式）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('首次请求应放行并拦截 res.json 缓存结果', async () => {
    const { req, res, next } = createIdempotencyReqRes('test-key-123');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(() => res.json({ success: true, data: 'result' })).not.toThrow();
  });

  it('相同 Key 第二次请求应返回缓存结果', async () => {
    const key = 'test-key-duplicate';
    const cachedBody = { success: true, data: 'cached' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
  });

  it('5xx 响应不应被缓存，重试应再次放行', async () => {
    const key = 'server-error-key';
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 500;
    r1.res.json({ success: false, error: 'internal' });

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
    expect(r2.res.status).not.toHaveBeenCalled();
  });

  it('不同 Key 应独立处理', async () => {
    const r1 = createIdempotencyReqRes('test-key-a');
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json({ success: true });

    const r2 = createIdempotencyReqRes('test-key-b');
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });

  it('首次 POST 应写入 Redis 缓存', async () => {
    const key = 'redis-first-key';
    const { req, res, next } = createIdempotencyReqRes(key);
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 201;
    res.json({ success: true, data: 'created' });
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));
  });

  it('相同 Key 第二次请求应从 Redis 返回缓存', async () => {
    const key = 'redis-dup-key';
    const cachedBody = { success: true, data: 'from-redis' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(cachedBody);
    expect(redisMocks.get).toHaveBeenCalledWith(`idempotency:${key}`);
  });

  it('并发相同 Key 的 POST 应返回缓存（Redis 模式）', async () => {
    const key = 'redis-race-key';
    const cachedBody = { success: true, data: 'race-winner' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);
    await vi.waitFor(() => expect(redisMocks.store.has(`idempotency:${key}`)).toBe(true));

    const concurrent = Array.from({ length: 4 }, () => createIdempotencyReqRes(key));
    await Promise.all(
      concurrent.map(
        ({ req, res, next }) =>
          new Promise<void>((resolve) => {
            idempotencyKey(req, res, next);
            vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(200)).then(resolve);
          }),
      ),
    );
    for (const { res, next } of concurrent) {
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(cachedBody);
    }
  });

  it('5xx 响应在 Redis 模式下不应缓存', async () => {
    const key = 'redis-5xx-key';
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 503;
    r1.res.json({ success: false });
    expect(redisMocks.store.has(`idempotency:${key}`)).toBe(false);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });

  it('换行符注入 Key 应被安全处理', async () => {
    const body = { success: true };
    const r1 = createIdempotencyReqRes(NEWLINE_INJECTION_KEY);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(body);

    const r2 = createIdempotencyReqRes(NEWLINE_INJECTION_KEY);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(body);
  });

  it('Redis 缓存写入失败应记录 warn 且不阻塞响应', async () => {
    redisMocks.useRedisSuccess();
    redisMocks.set.mockRejectedValueOnce(new Error('redis set failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-write-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    res.statusCode = 200;
    expect(() => res.json({ success: true })).not.toThrow();
    await vi.waitFor(() => expect(redisMocks.set).toHaveBeenCalled());
  });
});

// ---------------------------------------------------------------------------
// ADR-045：Redis 不可用时 fail-closed（返回 503 + Retry-After，不再降级到内存）
// ---------------------------------------------------------------------------

describe('idempotencyKey Redis 不可用时 fail-closed（ADR-045）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 模拟 Redis 不可用：ping 失败 → getRedisHealth 返回 false
    redisMocks.useMemoryFallback();
  });

  it('Redis 不可用时 POST + Idempotency-Key 应返回 503 + Retry-After', async () => {
    const { req, res, next } = createIdempotencyReqRes('redis-down-key');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(503));
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('Redis get 异常应返回 503（不再降级到内存）', async () => {
    // 健康检查通过，但 get 抛错 → catch 分支返回 503
    redisMocks.ping.mockResolvedValue('PONG');
    redisMocks.get.mockRejectedValueOnce(new Error('redis read failed'));
    const { req, res, next } = createIdempotencyReqRes('redis-get-fail');
    idempotencyKey(req, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(503));
    expect(next).not.toHaveBeenCalled();
  });

  it('Redis 不可用时非 POST 请求仍应放行（不触发幂等检查）', () => {
    const { req, res, next } = createMockReqResWithoutKey('GET');
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Redis 不可用时无 Idempotency-Key 头仍应放行', () => {
    const { req, res, next } = createMockReqResWithoutKey('POST');
    idempotencyKey(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('安全攻击用例', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('并发相同 Key 竞态条件：5 个并发请求只有一个执行 handler，其余返回缓存', async () => {
    const key = 'race-condition-key-12345';
    const cachedBody = { success: true, data: 'first-response' };
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(cachedBody);

    const concurrent = Array.from({ length: 4 }, () => createIdempotencyReqRes(key));
    await Promise.all(
      concurrent.map(
        ({ req, res, next }) =>
          new Promise<void>((resolve) => {
            idempotencyKey(req, res, next);
            vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(200)).then(resolve);
          }),
      ),
    );
    for (const { res, next } of concurrent) {
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(cachedBody);
    }
  });

  it.each([
    { name: 'SQL 注入', key: SQL_INJECTION_KEY, body: { success: true } },
    { name: 'XSS 载荷', key: XSS_KEY, body: { success: true, data: 'xss-test' } },
    { name: '换行符注入', key: 'key\ninjected: evil', body: { success: true, data: 'safe' } },
  ])('$name 作为 Key 应被安全存储（Redis 模式）', async ({ key, body }) => {
    const r1 = createIdempotencyReqRes(key);
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.next).toHaveBeenCalledTimes(1));
    r1.res.statusCode = 200;
    r1.res.json(body);

    const r2 = createIdempotencyReqRes(key);
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.res.status).toHaveBeenCalledWith(200));
    expect(r2.next).not.toHaveBeenCalled();
    expect(r2.res.json).toHaveBeenCalledWith(body);
  });

  it('Redis ready/error 事件应更新可用性状态', async () => {
    // 先 error → 不可用 → 503；再 ready → 可用 → 放行
    redisMocks.useMemoryFallback();
    const r1 = createIdempotencyReqRes('redis-state-key');
    idempotencyKey(r1.req, r1.res, r1.next);
    await vi.waitFor(() => expect(r1.res.status).toHaveBeenCalledWith(503));

    redisMocks.useRedisSuccess();
    const r2 = createIdempotencyReqRes('redis-state-key-2');
    idempotencyKey(r2.req, r2.res, r2.next);
    await vi.waitFor(() => expect(r2.next).toHaveBeenCalledTimes(1));
  });
});
