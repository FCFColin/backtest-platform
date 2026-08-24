import { expect, type vi } from 'vitest';

export interface ApiResult {
  res: Response;
  body: unknown;
}

type MockFn = ReturnType<typeof vi.fn>;

const errOf = (body: unknown): Record<string, unknown> =>
  (body as { error?: Record<string, unknown> } | null)?.error ?? {};

/**
 * RFC 9457 ProblemDetails 断言：res.status 与 body.error.type 必须同时断言，
 * 杜绝「状态码对但信封错」的假阳性。
 */
export function expectProblem(
  r: ApiResult,
  e: { status: number; code?: string; titleLike?: string | RegExp; detailLike?: string | RegExp },
): void {
  const err = errOf(r.body);
  expect(r.res.status).toBe(e.status);
  expect(err.status).toBe(e.status);
  if (e.code !== undefined) {
    expect(err.code).toBe(e.code);
    expect(err.type).toBe(`https://backtest.platform/errors/${e.code}`);
  }
  if (e.titleLike !== undefined) expect(String(err.title)).toContain(String(e.titleLike));
  if (e.detailLike !== undefined) {
    if (typeof e.detailLike === 'string') expect(String(err.detail)).toContain(e.detailLike);
    else expect(String(err.detail)).toMatch(e.detailLike);
  }
}

/** Data 端点降级语义专项断言（契约红线，见 ADR-008 / §1 降级语义契约）。 */
export function expectDegraded(r: ApiResult, degraded = true): void {
  expect((r.body as { degraded?: boolean } | null)?.degraded).toBe(degraded);
}

/** outbox 双写验证：扫描 mock Pool/PoolClient 的 query 调用中的 INSERT INTO outbox。 */
export function expectOutboxWritten(
  db: { query: MockFn },
  e: { eventType: string; aggregateType?: string; payloadMatch?: Record<string, unknown> },
): void {
  const writes = db.query.mock.calls
    .filter(([sql]) => String(sql).includes('INSERT INTO outbox'))
    .map(([, params]) => params as unknown[]);
  if (writes.length === 0) {
    throw new Error('expectOutboxWritten: 未发现任何 outbox 写入');
  }
  const matched = writes.find((p) => p[2] === e.eventType);
  if (!matched) {
    throw new Error(
      `expectOutboxWritten: 未找到 event_type=${e.eventType}（实际: ${writes.map((p) => p[2]).join(', ')}）`,
    );
  }
  if (e.aggregateType !== undefined) expect(matched[0]).toBe(e.aggregateType);
  if (e.payloadMatch !== undefined) {
    expect(JSON.parse(String(matched[3]))).toEqual(expect.objectContaining(e.payloadMatch));
  }
}
