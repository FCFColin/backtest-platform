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
    '引擎停止：/api/ready 保持 200 摘流豁免 + 响应体 engine.status=unavailable（ADR-008 补充 2026-09-04）',
    async () => {
      expect(await waitForHealthy(READY_URL, 10000)).toBe(true);
      await withContainerStopped(
        CONTAINERS.engineGo,
        async () => {
          await new Promise((r) => setTimeout(r, 2000));
          const res = await fetch(READY_URL);
          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            degraded?: unknown;
            engine?: { status?: string; retryAfter?: number };
          };
          expect(body.degraded).toBeUndefined();
          expect(body.engine?.status).toBe('unavailable');
          expect(body.engine?.retryAfter).toBe(30);
        },
        { readyUrl: READY_URL },
      );
    },
  );
});
