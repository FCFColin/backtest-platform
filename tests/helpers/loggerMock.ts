import { vi } from 'vitest';
import { loggerMocks } from './loggerFixture.js';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
  sanitizeLog: (s: string) => s.replace(/[\n\r]/g, '').substring(0, 50),
}));
