import { vi } from 'vitest';

const internalMocks = vi.hoisted(() => ({
  ping: vi.fn().mockResolvedValue('PONG'),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  incr: vi.fn(),
  incrby: vi.fn(),
  decr: vi.fn().mockResolvedValue(0),
  scan: vi.fn().mockResolvedValue(['0', []]),
  on: vi.fn(),
}));

export const redisMocks = internalMocks;

export const redisModuleMock = {
  appRedis: internalMocks,
  redisConnection: {},
  bullmqConnectionOptions: {},
};
