import { describe, it, expect } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  setupChaosLifecycle,
  waitForHealthy,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const READY_URL = `${API_URL}/api/ready`;

const fixture = setupChaosLifecycle(CONTAINERS.engineGo);

describe('Chaos Experiment 5: Go Engine Outage', () => {
  it.skipIf(!fixture.containerReady)(
    '引擎停止：/api/ready fail-closed 503 + Retry-After: 30，且无 degraded 字段（ADR-008）',
    async () => {
      expect(await waitForHealthy(READY_URL, 10000)).toBe(true);
      await withContainerStopped(
        CONTAINERS.engineGo,
        async () => {
          await new Promise((r) => setTimeout(r, 2000));
          const res = await fetch(READY_URL);
          expect(res.status).toBe(503);
          expect(res.headers.get('Retry-After')).toBe('30');
          expect(((await res.json()) as { degraded?: unknown }).degraded).toBeUndefined();
        },
        { readyUrl: READY_URL },
      );
    },
  );
});
