/**
 * 组织邀请服务单元测试（ADR-035）
 *
 * 企业理由：邀请承载把外部邮箱按角色加入组织的控制流程，必须验证：
 * 1. 创建仅存令牌哈希、一次性返回明文、先清理同邮箱待处理邀请
 * 2. 列表/撤销以 org_id 收敛（防跨租户）
 * 3. 接受流程在事务内校验有效/过期/已接受，并 upsert membership
 *
 * Mock 策略：mock db.getPool（query + connect 客户端），避免真实数据库依赖。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  client: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/db/index.js', () => ({
  getPool: () => ({ query: dbMocks.query, connect: () => Promise.resolve(dbMocks.client) }),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  acceptInvitation,
} from '../../../packages/backend/src/services/invitationService.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const INV_ID = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

function invRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INV_ID,
    org_id: ORG,
    email: 'a@b.com',
    role: 'analyst',
    invited_by: USER,
    expires_at: new Date(Date.now() + 86400000),
    accepted_at: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('createInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应先清理同邮箱待处理邀请，再插入并返回一次性令牌', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rowCount: 0 }) // DELETE 历史待处理
      .mockResolvedValueOnce({ rows: [invRow()] }); // INSERT RETURNING
    const created = await createInvitation(ORG, 'a@b.com', 'analyst', USER);

    expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(created.id).toBe(INV_ID);
    // 第一次调用是清理待处理邀请
    expect(dbMocks.query.mock.calls[0][0]).toContain('DELETE FROM invitations');
    // 写入的是哈希而非明文
    const insertParams = dbMocks.query.mock.calls[1][1] as unknown[];
    const tokenHash = insertParams[3] as string;
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toContain(created.token);
  });
});

describe('listInvitations / revokeInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list 应以 org_id 过滤并映射记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [invRow()] });
    const list = await listInvitations(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: INV_ID, orgId: ORG, email: 'a@b.com', role: 'analyst' });
    expect(dbMocks.query.mock.calls[0][1]).toEqual([ORG]);
  });

  it('revoke 应以 org_id 收敛且仅作用于未接受邀请', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await revokeInvitation(ORG, INV_ID)).toBe(false);
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('accepted_at IS NULL');
    expect(params).toEqual([INV_ID, ORG]);
  });

  it('revoke 成功返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await revokeInvitation(ORG, INV_ID)).toBe(true);
  });
});

describe('acceptInvitation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('非法/空令牌应直接拒绝', async () => {
    expect(await acceptInvitation('', USER)).toEqual({ ok: false, reason: 'invalid' });
    expect(dbMocks.client.query).not.toHaveBeenCalled();
  });

  it('令牌不存在应返回 invalid 并回滚', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // SELECT FOR UPDATE
    const result = await acceptInvitation('sometoken', USER);
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(dbMocks.client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('已接受应返回 already', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: INV_ID,
            org_id: ORG,
            role: 'analyst',
            expires_at: new Date(Date.now() + 1000),
            accepted_at: new Date(),
          },
        ],
      });
    expect(await acceptInvitation('sometoken', USER)).toEqual({ ok: false, reason: 'already' });
  });

  it('已过期应返回 expired', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: INV_ID,
            org_id: ORG,
            role: 'analyst',
            expires_at: new Date(Date.now() - 1000),
            accepted_at: null,
          },
        ],
      });
    expect(await acceptInvitation('sometoken', USER)).toEqual({ ok: false, reason: 'expired' });
  });

  it('有效令牌应 upsert membership、标记已接受并提交', async () => {
    dbMocks.client.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: INV_ID,
            org_id: ORG,
            role: 'analyst',
            expires_at: new Date(Date.now() + 86400000),
            accepted_at: null,
          },
        ],
      })
      .mockResolvedValueOnce(undefined) // INSERT membership ON CONFLICT
      .mockResolvedValueOnce(undefined) // UPDATE invitations accepted_at
      .mockResolvedValueOnce(undefined); // COMMIT
    const result = await acceptInvitation('sometoken', USER);
    expect(result).toEqual({ ok: true, orgId: ORG, role: 'analyst' });
    expect(dbMocks.client.query).toHaveBeenCalledWith('COMMIT');
    const insertCall = dbMocks.client.query.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO memberships'),
    );
    expect(insertCall?.[1]).toEqual([ORG, USER, 'analyst']);
  });
});
