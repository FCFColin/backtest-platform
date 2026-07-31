import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  loginPasswordSchema,
  registerSchema,
} from '../../../packages/backend/src/schemas/misc-schemas.js';

describe('loginSchema', () => {
  it.each([
    ['合法 API Key', { apiKey: 'sk-abc123' }, true],
    ['空 API Key', { apiKey: '' }, false],
    ['超过 512 字符', { apiKey: 'a'.repeat(513) }, false],
  ])('%s 应 %s', (_n, data, shouldPass) => {
    expect(loginSchema.safeParse(data).success).toBe(shouldPass);
  });
});

describe('loginPasswordSchema', () => {
  it.each([
    ['合法凭据', { username: 'admin', password: 'secret123' }, true],
    ['空用户名', { username: '', password: 'secret123' }, false],
    ['空密码', { username: 'admin', password: '' }, false],
    ['用户名超 100 字符', { username: 'a'.repeat(101), password: 'secret' }, false],
    ['密码超 256 字符', { username: 'admin', password: 'a'.repeat(257) }, false],
  ])('%s 应 %s', (_n, data, shouldPass) => {
    expect(loginPasswordSchema.safeParse(data).success).toBe(shouldPass);
  });

  it('用户名前后空格应被 trim', () => {
    const r = loginPasswordSchema.safeParse({ username: '  admin  ', password: 'secret' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.username).toBe('admin');
  });
});

describe('registerSchema', () => {
  const valid = { username: 'newuser', email: 'user@example.com', password: 'password123' };

  it.each([
    ['合法注册', valid, true],
    ['用户名少于 2 字符', { ...valid, username: 'a' }, false],
    ['用户名超 50 字符', { ...valid, username: 'a'.repeat(51) }, false],
    ['邮箱格式不正确', { ...valid, email: 'not-an-email' }, false],
    ['密码少于 6 字符', { ...valid, password: '12345' }, false],
    ['密码超 256 字符', { ...valid, password: 'a'.repeat(257) }, false],
    ['邮箱超 254 字符', { ...valid, email: `${'a'.repeat(249)}@b.com` }, false],
  ])('%s 应 %s', (_n, data, shouldPass) => {
    expect(registerSchema.safeParse(data).success).toBe(shouldPass);
  });

  it('邮箱应转为小写', () => {
    const r = registerSchema.safeParse({ ...valid, email: 'User@Example.COM' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('user@example.com');
  });

  it('orgName 为可选', () => {
    const r = registerSchema.safeParse({ ...valid, orgName: 'My Org' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.orgName).toBe('My Org');
  });
});