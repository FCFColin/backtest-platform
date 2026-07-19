export interface RefreshTokenTestConfig {
  NODE_ENV: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: number;
  JWT_REFRESH_TTL: number;
  JWT_ALGORITHM: string;
  JWT_PRIVATE_KEY: string;
  JWT_PRIVATE_KEY_FILE: string;
  JWT_PUBLIC_KEY: string;
  JWT_PUBLIC_KEY_FILE: string;
}

export interface RefreshTokenTestHandles {
  mocks: { config: RefreshTokenTestConfig };
  redisMocks: Record<string, unknown>;
}

export function createRefreshTokenTestHandles(): RefreshTokenTestHandles {
  return {
    mocks: {
      config: {
        NODE_ENV: 'test',
        JWT_SECRET: 'test-jwt-secret-for-unit-tests',
        JWT_ACCESS_TTL: 900,
        JWT_REFRESH_TTL: 604800,
        JWT_ALGORITHM: 'RS256',
        JWT_PRIVATE_KEY: '',
        JWT_PRIVATE_KEY_FILE: '',
        JWT_PUBLIC_KEY: '',
        JWT_PUBLIC_KEY_FILE: '',
      },
    },
    redisMocks: {} as Record<string, unknown>,
  };
}
