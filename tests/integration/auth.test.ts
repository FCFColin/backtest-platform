import { describe, it, expect, beforeAll } from 'vitest';
import { checkServerAvailable } from '../helpers/chaos.js';
import { API_BASE_URL } from '../helpers/expressApp.js';

const BASE = `${API_BASE_URL}/api/v1`;

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailable(API_BASE_URL);
});

describe('Auth Integration', () => {
  it.skipIf(!serverAvailable)('POST /auth/login/password 无凭证应返回422', async () => {
    const res = await fetch(`${BASE}/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
