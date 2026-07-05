/**
 * 发布 RebalanceTriggered 领域事件（T-30）
 */
import { eventDispatcher } from './EventDispatcher.js';

export interface RebalanceTriggeredPayload {
  portfolioId: string;
  date: string;
  reason: string;
  currentWeights: Record<string, number>;
}

/**
 * 在再平衡发生时发布领域事件，供 RebalanceTriggeredHandler 消费。
 */
export async function publishRebalanceTriggered(payload: RebalanceTriggeredPayload): Promise<void> {
  await eventDispatcher.dispatch({
    eventType: 'RebalanceTriggered',
    aggregateType: 'Portfolio',
    aggregateId: payload.portfolioId,
    payload: {
      portfolioId: payload.portfolioId,
      timestamp: payload.date,
      reason: payload.reason,
      currentWeights: payload.currentWeights,
    },
    occurredAt: new Date(),
  });
}
