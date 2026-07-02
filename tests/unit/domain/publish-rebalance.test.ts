/**
 * publishRebalanceTriggered 单元测试（T-30）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dispatchMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../../../api/domain/events/EventDispatcher.js', () => ({
  eventDispatcher: { dispatch: dispatchMock },
}));

import { publishRebalanceTriggered } from '../../../api/domain/events/publish-rebalance.js';

describe('publishRebalanceTriggered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应分发 RebalanceTriggered 领域事件', async () => {
    await publishRebalanceTriggered({
      portfolioId: 'p1',
      date: '2024-06-01',
      reason: 'threshold',
      currentWeights: { SPY: 60, BND: 40 },
    });

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'RebalanceTriggered',
        aggregateType: 'Portfolio',
        aggregateId: 'p1',
        payload: expect.objectContaining({
          portfolioId: 'p1',
          reason: 'threshold',
        }),
      }),
    );
  });
});
