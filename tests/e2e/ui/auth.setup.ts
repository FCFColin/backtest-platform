import { test as setup } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// E2E 前置认证：注册 + 登录 + 创建组织 API Key，导出 storageState
// （计算端点强制认证 D2-007；API Key 无轮换语义，可跨测试复用；
const USER = `e2e_${Date.now()}`;
const PASSWORD = 'E2ePassword!123';

setup('E2E 注册、登录并创建 API Key', async ({ request }) => {
  const reg = await request.post('/api/v1/auth/register', {
    data: { username: USER, password: PASSWORD, email: `${USER}@e2e.local`, orgName: 'E2E Org' },
  });
  if (!reg.ok() && reg.status() !== 409) {
    throw new Error(`注册失败: ${reg.status()} ${await reg.text()}`);
  }
  const login = await request.post('/api/v1/auth/login/password', {
    data: { username: USER, password: PASSWORD },
  });
  if (!login.ok()) {
    throw new Error(`登录失败: ${login.status()} ${await login.text()}`);
  }
  const { accessToken } = (await login.json()).data;
  const keyRes = await request.post('/api/v1/keys', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: 'e2e' },
  });
  if (!keyRes.ok()) {
    throw new Error(`API Key 创建失败: ${keyRes.status()} ${await keyRes.text()}`);
  }
  const { apiKey } = (await keyRes.json()).data;
  const state = await request.storageState();
  state.origins.push({
    origin: `http://localhost:${process.env.API_PORT ?? '15001'}`,
    localStorage: [{ name: 'admin_api_key', value: Buffer.from(apiKey).toString('base64') }],
  });
  mkdirSync('.auth', { recursive: true });
  writeFileSync('.auth/user.json', JSON.stringify(state, null, 2));
});
