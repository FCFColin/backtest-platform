import { describe, it, expect, beforeAll } from 'vitest';
import { checkServerAvailable } from '../helpers/chaos.js';
import { API_BASE_URL } from '../helpers/expressApp.js';

const BASE = `${API_BASE_URL}/api/v1`;

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailable(API_BASE_URL);
});

describe('Data Integration', () => {
  it.skipIf(!serverAvailable)('GET /data/meta 返回 JSON', async () => {
    const res = await fetch(`${BASE}/data/meta`);
    expect(res.status).toBe(200);
  });
});
