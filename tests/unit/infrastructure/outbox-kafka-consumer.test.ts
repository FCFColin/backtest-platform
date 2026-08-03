import { describe, it, expect, vi } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: {
    CDC_KAFKA_ENABLED: false,
    KAFKA_BROKERS: '',
    KAFKA_GROUP_ID: 'backtest',
    KAFKA_TOPICS: '',
  },
}));

import { OutboxKafkaConsumer } from '../../../packages/backend/src/infrastructure/outboxKafkaConsumer.js';

describe('OutboxKafkaConsumer - 未启用/降级路径', () => {
  it('CDC_KAFKA_ENABLED=false 时 start 为 no-op（保持 LISTEN/NOTIFY 默认通路）', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await expect(consumer.start()).resolves.toBeUndefined();
    await expect(consumer.stop()).resolves.toBeUndefined();
  });
});

describe('OutboxKafkaConsumer - kafkajs 未安装降级', () => {
  it('CDC 启用但 kafkajs 未安装时降级为 no-op 不抛错', async () => {
    vi.doMock('../../../packages/backend/src/config/index.js', () => ({
      config: {
        CDC_KAFKA_ENABLED: true,
        KAFKA_BROKERS: '127.0.0.1:9092',
        KAFKA_GROUP_ID: 'backtest',
        KAFKA_TOPICS: 'backtest.run',
      },
    }));
    const { OutboxKafkaConsumer: FreshConsumer } =
      await import('../../../packages/backend/src/infrastructure/outboxKafkaConsumer.js');
    const consumer = new FreshConsumer(() => null);
    await expect(consumer.start()).resolves.toBeUndefined();
  });
});
