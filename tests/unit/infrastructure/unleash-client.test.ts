import { describe, it, expect, vi } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
const unleashMocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (payload?: unknown) => void>,
  isEnabled: vi.fn(() => true),
  getFeatureToggleDefinitions: vi.fn(() => [{ name: 'beta_flag', enabled: true }]),
  initialize: vi.fn(() => ({
    on: (evt: string, cb: (payload?: unknown) => void) => {
      unleashMocks.handlers[evt] = cb;
    },
    isEnabled: unleashMocks.isEnabled,
    getFeatureToggleDefinitions: unleashMocks.getFeatureToggleDefinitions,
  })),
}));

const redisMocks = vi.hoisted(() => ({
  snapshotStore: new Map<string, string>(),
  get: vi.fn(async (key: string) => redisMocks.snapshotStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    redisMocks.snapshotStore.set(key, value);
    return 'OK';
  }),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  redisConnection: redisMocks,
}));
vi.mock('unleash-client', () => ({ initialize: unleashMocks.initialize }), { virtual: true });

import type { UnleashSingleton } from '../../../packages/backend/src/infrastructure/unleashClient.js';

async function loadUnleash() {
  vi.resetModules();
  const mod = await import('../../../packages/backend/src/infrastructure/unleashClient.js');
  return mod.unleashClient as UnleashSingleton;
}

const tick = () => new Promise((r) => setTimeout(r, 10));

describe('unleashClient - 降级路径', () => {
  it('未初始化且无快照时应 fail-closed 返回 false（unleash-client 未安装/不可用的生产行为）', async () => {
    redisMocks.snapshotStore.clear();
    const client = await loadUnleash();
    await tick();
    expect(client.isInitialized).toBe(false);
    expect(client.isEnabled('any_flag')).toBe(false);
  });

  it('未初始化但有 Redis 快照时应从快照返回 flag 状态（冷启动恢复）', async () => {
    redisMocks.snapshotStore.set(
      'unleash:flags:snapshot',
      JSON.stringify([
        { name: 'beta_flag', enabled: true },
        { name: 'dead_flag', enabled: false },
      ]),
    );
    const client = await loadUnleash();
    await tick();
    expect(client.isEnabled('beta_flag')).toBe(true);
    expect(client.isEnabled('dead_flag')).toBe(false);
    expect(client.isEnabled('unknown_flag')).toBe(false);
  });
});
