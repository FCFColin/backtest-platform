import { describe, it, expect } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  waitForCondition,
  setupChaosLifecycle,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const READY_URL = `${API_URL}/api/ready`;
const DATA_HEALTH_URL = `${API_URL}/api/v1/data/health`;

const fixture = setupChaosLifecycle(CONTAINERS.dataFetcher);

async function readyGoDataService(): Promise<boolean | undefined> {
  try {
    const json = (await (await fetch(READY_URL)).json()) as {
      data?: { dependencies?: { goDataService?: boolean } };
    };
    return json.data?.dependencies?.goDataService;
  } catch {
    return undefined;
  }
}

describe('Chaos Experiment 2: Data Service Unreachable', () => {
  it.skipIf(!fixture.containerReady)(
    'data-fetcher 停止：/api/ready 标记 goDataService=false，数据健康端点 503，恢复后正常',
    async () => {
      expect(await waitForCondition(async () => (await readyGoDataService()) === true, 10000)).toBe(
        true,
      );

      await withContainerStopped(
        CONTAINERS.dataFetcher,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          expect(await readyGoDataService()).toBe(false);
          const res = await fetch(DATA_HEALTH_URL);
          expect(res.status, 'data-fetcher 不可达时数据健康端点应 503').toBe(503);
        },
        { settleMs: 0 },
      );

      // ready 在 goDataService=false 时仍返回 200，须等依赖真正恢复而非仅 ready 可达
      expect(
        await waitForCondition(async () => (await readyGoDataService()) === true, 30000),
        'data-fetcher 重启后 goDataService 应恢复为 true',
      ).toBe(true);
    },
    90000,
  );
});
