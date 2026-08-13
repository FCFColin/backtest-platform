import { vi } from 'vitest';

const internalMocks = vi.hoisted(() => ({
  ping: vi.fn().mockResolvedValue('PONG'),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  getdel: vi.fn(),
  expire: vi.fn().mockResolvedValue(1),
  incr: vi.fn(),
  incrby: vi.fn(),
  decr: vi.fn().mockResolvedValue(0),
  scan: vi.fn().mockResolvedValue(['0', []]),
  eval: vi.fn(),
  ttl: vi.fn(),
  exists: vi.fn(),
  multi: vi.fn(),
  info: vi.fn(),
  quit: vi.fn(),
  call: vi.fn(),
  publish: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  getRedisHealth: vi.fn().mockResolvedValue(true),
  markRedisUnhealthy: vi.fn(),
  buildRedisBaseOptions: vi.fn(() => ({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })),
  checkSentinelMaster: vi.fn().mockResolvedValue({ isMaster: null, connectedSlaves: null }),
}));

export const redisMocks = internalMocks;

export const redisModuleMock = {
  appRedis: internalMocks,
  redisConnection: {},
  bullmqConnectionOptions: {
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  },
  isSentinelMode: false,
  getRedisHealth: internalMocks.getRedisHealth,
  markRedisUnhealthy: internalMocks.markRedisUnhealthy,
  buildRedisBaseOptions: internalMocks.buildRedisBaseOptions,
  checkSentinelMaster: internalMocks.checkSentinelMaster,
};
