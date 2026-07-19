import { vi } from 'vitest';

export interface JwtAuthTestHandles {
  mocks: { config: Record<string, unknown> };
  redisMocks: Record<string, unknown>;
  apiKeyMocks: { verifyApiKey: ReturnType<typeof vi.fn> };
}

export function createJwtAuthTestHandles(): JwtAuthTestHandles {
  return {
    mocks: { config: {} },
    redisMocks: {},
    apiKeyMocks: { verifyApiKey: vi.fn(async () => null) },
  };
}
