import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __heartbeatSweep,
  __upgradeGuardRejects,
  __registerChannelClient,
  __channelClientCount,
  __resetWsInternals,
} from '../../../packages/backend/src/services/backtestWs.js';

interface FakeWsLike {
  readyState: number;
  ping: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

function makeFakeWs(readyState = 1): FakeWsLike & Record<string, unknown> {
  return { readyState, ping: vi.fn(), terminate: vi.fn() };
}

describe('backtestWs 连接治理接缝（A2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    __resetWsInternals();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('__heartbeatSweep（A2-①）', () => {
    it('存活连接：置 isAlive=false 并 ping', () => {
      const ws = makeFakeWs() as FakeWsLike & { isAlive?: boolean };
      ws.isAlive = true;
      __heartbeatSweep([ws as never]);
      expect(ws.isAlive).toBe(false);
      expect(ws.ping).toHaveBeenCalledTimes(1);
      expect(ws.terminate).not.toHaveBeenCalled();
    });
    it('两轮无 pong 的半开连接：第二轮 terminate 回收', () => {
      const ws = makeFakeWs() as FakeWsLike & { isAlive?: boolean };
      ws.isAlive = true;
      __heartbeatSweep([ws as never]); // 第一轮：标记待检
      __heartbeatSweep([ws as never]); // 第二轮：仍无 pong → 回收
      expect(ws.terminate).toHaveBeenCalledTimes(1);
      expect(ws.ping).toHaveBeenCalledTimes(1);
    });
  });

  describe('__upgradeGuardRejects（A2-②③）', () => {
    it('达到 MAX_WS_CLIENTS 返回 503，未达返回 null', () => {
      vi.stubEnv('MAX_WS_CLIENTS', '2');
      expect(__upgradeGuardRejects(2, '10.0.0.1')).toBe(503);
      expect(__upgradeGuardRejects(1, '10.0.0.1')).toBeNull();
    });
    it('同 IP 窗口内超出 WS_HANDSHAKE_RATE 返回 429', () => {
      vi.stubEnv('WS_HANDSHAKE_RATE', '2');
      expect(__upgradeGuardRejects(0, '10.9.9.9')).toBeNull();
      expect(__upgradeGuardRejects(0, '10.9.9.9')).toBeNull();
      expect(__upgradeGuardRejects(0, '10.9.9.9')).toBe(429);
    });
    it('上限优先于限流（最廉价拒绝先行）', () => {
      vi.stubEnv('MAX_WS_CLIENTS', '1');
      vi.stubEnv('WS_HANDSHAKE_RATE', '1');
      expect(__upgradeGuardRejects(5, '10.0.0.2')).toBe(503);
    });
  });

  describe('__registerChannelClient（A2-④ 竞态守卫）', () => {
    it('已关闭连接拒绝入册（cleanup 已先行跑空的僵尸窗口）', () => {
      expect(__registerChannelClient('runs:j1', { readyState: 3 } as never)).toBe(false);
      expect(__channelClientCount('runs:j1')).toBe(0);
    });
    it('OPEN 连接正常入册且可计数', () => {
      expect(__registerChannelClient('runs:j1', { readyState: 1 } as never)).toBe(true);
      expect(__registerChannelClient('runs:j1', { readyState: 1 } as never)).toBe(true);
      expect(__channelClientCount('runs:j1')).toBe(2);
    });
  });
});
