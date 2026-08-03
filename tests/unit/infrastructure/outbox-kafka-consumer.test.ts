import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loggerMocks, dispatchMock, kafkaMocks, webhookHandler } = vi.hoisted(() => {
  let eachMsgCb: ((p: unknown) => Promise<void>) | null = null;
  const consumerInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    run: vi
      .fn()
      .mockImplementation(async (opts: { eachMessage: (p: unknown) => Promise<void> }) => {
        eachMsgCb = opts.eachMessage;
      }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return {
    loggerMocks: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
    },
    dispatchMock: vi.fn().mockResolvedValue(undefined),
    kafkaMocks: {
      Kafka: vi.fn().mockImplementation(() => ({
        consumer: vi.fn().mockReturnValue(consumerInstance),
      })),
      consumerInstance,
      getEachMessageCb: () => eachMsgCb,
      reset: () => {
        eachMsgCb = null;
        consumerInstance.connect.mockClear();
        consumerInstance.subscribe.mockClear();
        consumerInstance.run.mockClear();
        consumerInstance.disconnect.mockClear();
      },
    },
    webhookHandler: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
vi.mock('../../../packages/backend/src/domain/events/events.js', () => ({
  eventDispatcher: { dispatch: dispatchMock },
}));
vi.mock('kafkajs', () => ({ Kafka: kafkaMocks.Kafka }));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: {
    CDC_KAFKA_ENABLED: true,
    KAFKA_BROKERS: '127.0.0.1:9092,127.0.0.1:9093',
    KAFKA_GROUP_ID: 'backtest-test',
    KAFKA_TOPICS: 'backtest.run,backtest.portfolio',
  },
}));

import { OutboxKafkaConsumer } from '../../../packages/backend/src/infrastructure/outboxKafkaConsumer.js';

beforeEach(() => {
  vi.clearAllMocks();
  kafkaMocks.reset();
});

describe('OutboxKafkaConsumer - start/stop 生命周期', () => {
  it('CDC 启用时应连接 Kafka、订阅 topic 并运行消费者', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    expect(kafkaMocks.Kafka).toHaveBeenCalledWith({
      clientId: 'backtest-test',
      brokers: ['127.0.0.1:9092', '127.0.0.1:9093'],
    });
    expect(kafkaMocks.consumerInstance.connect).toHaveBeenCalled();
    expect(kafkaMocks.consumerInstance.subscribe).toHaveBeenCalledWith({
      topics: ['backtest.run', 'backtest.portfolio'],
      fromBeginning: false,
    });
    expect(kafkaMocks.consumerInstance.run).toHaveBeenCalled();
  });

  it('stop 时应断开消费者连接', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    await consumer.stop();
    expect(kafkaMocks.consumerInstance.disconnect).toHaveBeenCalled();
  });

  it('connect 失败时应降级并清理 consumer', async () => {
    kafkaMocks.consumerInstance.connect.mockRejectedValueOnce(new Error('Connection refused'));
    const consumer = new OutboxKafkaConsumer(() => null);
    await expect(consumer.start()).resolves.toBeUndefined();
    expect(kafkaMocks.consumerInstance.disconnect).toHaveBeenCalled();
  });

  it('KAFKA_TOPICS 为空时应跳过订阅', async () => {
    vi.doMock('../../../packages/backend/src/config/index.js', () => ({
      config: {
        CDC_KAFKA_ENABLED: true,
        KAFKA_BROKERS: '127.0.0.1:9092',
        KAFKA_GROUP_ID: 'backtest',
        KAFKA_TOPICS: '',
      },
    }));
    const { OutboxKafkaConsumer: Fresh } =
      await import('../../../packages/backend/src/infrastructure/outboxKafkaConsumer.js');
    const consumer = new Fresh(() => null);
    await expect(consumer.start()).resolves.toBeUndefined();
    expect(kafkaMocks.consumerInstance.subscribe).not.toHaveBeenCalled();
  });
});

describe('OutboxKafkaConsumer - 消息处理', () => {
  it('应从 topic 推导 aggregateType，从 header 推导 eventType 并 dispatch', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb();
    expect(cb).not.toBeNull();
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('run-123'),
        value: Buffer.from(JSON.stringify({ result: 'ok' })),
        headers: { event_type: Buffer.from('BacktestCompleted') },
        timestamp: '1700000000000',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'BacktestCompleted',
        aggregateType: 'run',
        aggregateId: 'run-123',
      }),
    );
  });

  it('header 缺少 event_type 时应从 payload 的 eventType 字段回退', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.portfolio',
      message: {
        key: Buffer.from('pf-1'),
        value: Buffer.from(JSON.stringify({ eventType: 'PortfolioUpdated' })),
        headers: {},
        timestamp: '1700000000000',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PortfolioUpdated',
        aggregateType: 'portfolio',
      }),
    );
  });

  it('topic 无 backtest. 前缀时应使用完整 topic 作为 aggregateType', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'custom-topic',
      message: {
        key: null,
        value: Buffer.from(JSON.stringify({ event_type: 'CustomEvent' })),
        headers: {},
        timestamp: '0',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'custom-topic',
        aggregateId: '',
      }),
    );
  });

  it('eventType 完全缺失时应跳过（不 dispatch）', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('x'),
        value: Buffer.from(JSON.stringify({ data: 1 })),
        headers: {},
        timestamp: '0',
      },
    });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('value 为 null 时应使用空对象作为 payload', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('x'),
        value: null,
        headers: { type: Buffer.from('TestEvent') },
        timestamp: '0',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({ payload: {} }));
  });

  it('value 为非法 JSON 时应回退到 { raw: string }', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('x'),
        value: Buffer.from('not-json'),
        headers: { type: Buffer.from('TestEvent') },
        timestamp: '0',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { raw: 'not-json' } }),
    );
  });

  it('有 tenant_id header 且 webhook handler 存在时应触发 webhook', async () => {
    const consumer = new OutboxKafkaConsumer(() => webhookHandler);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('x'),
        value: Buffer.from(JSON.stringify({ eventType: 'TestEvent' })),
        headers: { tenant_id: Buffer.from('org-123') },
        timestamp: '0',
      },
    });
    expect(webhookHandler).toHaveBeenCalledWith('org-123', 'TestEvent', expect.any(Object));
  });

  it('webhook handler 抛错时不阻断消费', async () => {
    webhookHandler.mockRejectedValueOnce(new Error('webhook fail'));
    const consumer = new OutboxKafkaConsumer(() => webhookHandler);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('x'),
        value: Buffer.from(JSON.stringify({ eventType: 'TestEvent' })),
        headers: { tenant_id: Buffer.from('org-123') },
        timestamp: '0',
      },
    });
    expect(dispatchMock).toHaveBeenCalled();
  });

  it('header 值为非 Buffer 时应转为字符串', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    const cb = kafkaMocks.getEachMessageCb()!;
    await cb!({
      topic: 'backtest.run',
      message: {
        key: Buffer.from('x'),
        value: Buffer.from(JSON.stringify({})),
        headers: { event_type: 'StringEvent' as unknown as Buffer },
        timestamp: '0',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'StringEvent' }),
    );
  });
});

describe('OutboxKafkaConsumer - stop 清理', () => {
  it('consumer 为 null 时 stop 不抛错', async () => {
    const consumer = new OutboxKafkaConsumer(() => null);
    await expect(consumer.stop()).resolves.toBeUndefined();
  });

  it('disconnect 抛错时 stop 不抛错', async () => {
    kafkaMocks.consumerInstance.disconnect.mockRejectedValueOnce(new Error('disconnect fail'));
    const consumer = new OutboxKafkaConsumer(() => null);
    await consumer.start();
    await expect(consumer.stop()).resolves.toBeUndefined();
  });
});
