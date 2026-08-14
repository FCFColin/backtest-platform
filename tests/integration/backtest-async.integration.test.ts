import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { m, queueMocks } from '../unit/routes/backtestRoutes.shared.js';
import { createValidRequestBody, setupPortfolioServer } from '../helpers/backtestRoutesFixtures.js';
import backtestRoutes from '../../packages/backend/src/routes/backtestRoutes.js';

const jobStore = vi.hoisted(
  () =>
    new Map<
      string,
      {
        id: string;
        state: string;
        progress: number;
        returnvalue?: unknown;
        failedReason?: string;
        data?: Record<string, unknown>;
      }
    >(),
);

describe('P0-01 T3 · 异步回测全链路集成测试', () => {
  let server: { url: string; close: () => Promise<void> };

  const submit = (headers: Record<string, string> = {}) =>
    fetch(`${server.url}/api/v1/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(createValidRequestBody()),
    });
  const pollStatus = async (statusUrl: string) => {
    const res = await fetch(`${server.url}${statusUrl}`);
    return { res, json: await res.json() };
  };

  beforeEach(async () => {
    jobStore.clear();
    // GET /runs 走 jobAccessGranted（ADR-007 fail-closed），必须注入已认证请求上下文
    server = await setupPortfolioServer(backtestRoutes, m, {
      auth: { user: { sub: 'test-user', role: 'admin' }, tenantId: 'tenant-456' },
    });

    // 生产按 ADR-009 传 UUID jobId 作为 BullMQ 选项，mock 须采纳同一 id 才能让提交/轮询闭环
    queueMocks.add.mockImplementation(
      async (name: string, data: Record<string, unknown>, opts?: { jobId?: string }) => {
        const jobId = opts?.jobId ?? `job-${jobStore.size + 1}`;
        jobStore.set(jobId, {
          id: jobId,
          state: 'delayed',
          progress: 0,
          data,
        });
        return { id: jobId };
      },
    );

    queueMocks.getJob.mockImplementation(async (jobId: string) => {
      const job = jobStore.get(jobId);
      if (!job) return null;
      return {
        id: job.id,
        data: job.data,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        getState: vi.fn().mockResolvedValue(job.state),
      };
    });
  });

  afterEach(async () => {
    await server.close();
    queueMocks.add.mockReset();
    queueMocks.getJob.mockReset();
  });

  it('场景1: POST /portfolio → 202 Accepted → 轮询 → completed', async () => {
    const submitRes = await submit();
    expect(submitRes.status).toBe(202);
    const submitJson = await submitRes.json();
    expect(submitJson.success).toBe(true);
    expect(submitJson.data.jobId).toBeDefined();
    expect(submitJson.data.status).toBe('queued');

    const jobId = submitJson.data.jobId;

    const { res: initialRes, json: initialJson } = await pollStatus(submitJson.data.statusUrl);
    expect(initialRes.status).toBe(200);
    expect(initialJson.data.status).toBe('queued');

    const mockResult = {
      data: { portfolios: [{ name: 'Test', growthCurve: [] }] },
      warnings: [],
      dateRange: { start: '2024-01-01', end: '2024-06-30' },
    };
    const job = jobStore.get(jobId)!;
    job.state = 'completed';
    job.progress = 100;
    job.returnvalue = { status: 'completed', result: mockResult };

    const { res: finalRes, json: finalJson } = await pollStatus(submitJson.data.statusUrl);
    expect(finalRes.status).toBe(200);
    expect(finalJson.data.status).toBe('completed');
    expect(finalJson.data.progress).toBe(100);
    expect(finalJson.data.result).toEqual(mockResult);
  });

  it('场景2: POST /portfolio → 202 → Worker 超时 → failed', async () => {
    const submitRes = await submit();
    expect(submitRes.status).toBe(202);
    const submitJson = await submitRes.json();
    const jobId = submitJson.data.jobId;

    const job = jobStore.get(jobId)!;
    job.state = 'failed';
    job.progress = 30;
    job.failedReason = 'Engine timeout after 90s';

    const { res: pollRes, json: pollJson } = await pollStatus(submitJson.data.statusUrl);
    expect(pollRes.status).toBe(200);
    expect(pollJson.data.status).toBe('failed');
    expect(pollJson.data.error).toBe('Engine timeout after 90s');
  });

  it('场景3: 幂等性 — 相同 Idempotency-Key 返回已有 jobId', async () => {
    const idempotencyKey = 'idem-key-12345';

    const firstRes = await submit({ 'Idempotency-Key': idempotencyKey });
    expect(firstRes.status).toBe(202);
    const secondRes = await submit({ 'Idempotency-Key': idempotencyKey });
    expect(secondRes.status).toBe(202);

    const secondJson = await secondRes.json();
    expect(secondJson.data.jobId).toBeDefined();
    expect(secondJson.data.status).toBe('queued');
  });

  it('场景4: 任务不存在时返回 404', async () => {
    const { res, json } = await pollStatus('/api/v1/backtest/runs/nonexistent-job');
    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('JOB_NOT_FOUND');
  });
  it('场景5: 队列不可用时 fail-closed 返回 503（ADR-008）', async () => {
    queueMocks.add.mockRejectedValue(new Error('Redis connection refused'));

    const res = await submit();
    // ADR-008: 队列不可用时 fail-closed 返回 503 + Retry-After，不再回退同步执行
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
    expect(m.runPortfolioBacktest).not.toHaveBeenCalled();
  });
});
