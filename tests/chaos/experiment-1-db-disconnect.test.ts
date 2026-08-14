import { describe, it, expect } from 'vitest';
import {
  CONTAINERS,
  disconnectContainer,
  reconnectContainer,
  waitForHealthy,
  waitForCondition,
  setupChaosLifecycle,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const READY_URL = `${API_URL}/api/ready`;
const META_URL = `${API_URL}/api/v1/data/meta`;

const fixture = setupChaosLifecycle(CONTAINERS.postgres, reconnectContainer);

describe('Chaos Experiment 1: Database Disconnect', () => {
  it.skipIf(!fixture.containerReady)(
    'PG 网络分区：/meta fail-open 不 5xx，/api/ready fail-closed 503，恢复后正常',
    async () => {
      expect(await waitForHealthy(READY_URL, 10000)).toBe(true);
      expect((await (await fetch(META_URL)).json()).success).toBe(true);

      await disconnectContainer(CONTAINERS.postgres);

      try {
        await waitForCondition(async () => (await fetch(READY_URL)).status === 503, 10000, 500);
        for (let i = 0; i < 3; i++) {
          const res = await fetch(META_URL);
          expect(res.status, 'PG 分区期间 /meta 不得 500').toBe(200);
        }
        const ready = await fetch(READY_URL);
        expect(ready.status, 'PG 分区期间 /api/ready 应 fail-closed 503').toBe(503);
        expect(((await ready.json()) as { error?: { code?: string } }).error?.code).toBe(
          'DATABASE_UNAVAILABLE',
        );
      } finally {
        await reconnectContainer(CONTAINERS.postgres);
      }

      expect(await waitForHealthy(READY_URL, 30000)).toBe(true);
      expect((await (await fetch(META_URL)).json()).success).toBe(true);
    },
    90000,
  );
});
