import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  pool: { query: dbMocks.query },
  getReadPool: () => ({ query: dbMocks.query }),
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ NODE_ENV: 'test' }),
  validateConfig: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import announcementRoutes from '../../../packages/backend/src/routes/announcementRoutes.js';

describe('announcementRoutes - 权限（E4）', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => app.use('/api/v1/announcements', announcementRoutes));
  });
  afterEach(async () => {
    await server.close();
  });

  it('GET / 公开可访问（无需认证）', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'a1',
          title: '公告',
          body: '正文',
          category: 'info',
          severity: 'info',
          published_at: '2026-08-01',
        },
      ],
    });
    const res = await fetch(`${server.url}/api/v1/announcements`);
    expect(res.status).toBe(200);
  });

  it('POST / 无认证时应返回 401（管理员发布）', async () => {
    const res = await fetch(`${server.url}/api/v1/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', body: 'y' }),
    });
    expect(res.status).toBe(401);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
