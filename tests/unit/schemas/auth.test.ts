import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  loginPasswordSchema,
  registerSchema,
} from '../../../packages/backend/src/schemas/auth.js';

describe('loginSchema', () => {
  it('应接受合法 API Key', () => {
    const r = loginSchema.safeParse({ apiKey: 'sk-abc123' });
    expect(r.success).toBe(true);
  });

  it('空 API Key 应拒绝', () => {
    const r = loginSchema.safeParse({ apiKey: '' });
    expect(r.success).toBe(false);
  });

  it('超过 512 字符的 API Key 应拒绝', () => {
    const r = loginSchema.safeParse({ apiKey: 'a'.repeat(513) });
    expect(r.success).toBe(false);
  });
});

describe('loginPasswordSchema', () => {
  it('应接受合法凭据', () => {
    const r = loginPasswordSchema.safeParse({ username: 'admin', password: 'secret123' });
    expect(r.success).toBe(true);
  });

  it('空用户名应拒绝', () => {
    const r = loginPasswordSchema.safeParse({ username: '', password: 'secret123' });
    expect(r.success).toBe(false);
  });

  it('空密码应拒绝', () => {
    const r = loginPasswordSchema.safeParse({ username: 'admin', password: '' });
    expect(r.success).toBe(false);
  });

  it('超过 100 字符的用户名应拒绝', () => {
    const r = loginPasswordSchema.safeParse({ username: 'a'.repeat(101), password: 'secret' });
    expect(r.success).toBe(false);
  });

  it('超过 256 字符的密码应拒绝', () => {
    const r = loginPasswordSchema.safeParse({ username: 'admin', password: 'a'.repeat(257) });
    expect(r.success).toBe(false);
  });

  it('用户名前后空格应被 trim', () => {
    const r = loginPasswordSchema.safeParse({ username: '  admin  ', password: 'secret' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.username).toBe('admin');
    }
  });
});

describe('registerSchema', () => {
  it('应接受合法注册信息', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'user@example.com',
      password: 'password123',
    });
    expect(r.success).toBe(true);
  });

  it('用户名少于 2 字符应拒绝', () => {
    const r = registerSchema.safeParse({
      username: 'a',
      email: 'user@example.com',
      password: 'password123',
    });
    expect(r.success).toBe(false);
  });

  it('用户名超过 50 字符应拒绝', () => {
    const r = registerSchema.safeParse({
      username: 'a'.repeat(51),
      email: 'user@example.com',
      password: 'password123',
    });
    expect(r.success).toBe(false);
  });

  it('邮箱格式不正确应拒绝', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(r.success).toBe(false);
  });

  it('邮箱应转为小写', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'User@Example.COM',
      password: 'password123',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('user@example.com');
    }
  });

  it('密码少于 6 字符应拒绝', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'user@example.com',
      password: '12345',
    });
    expect(r.success).toBe(false);
  });

  it('密码超过 256 字符应拒绝', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'user@example.com',
      password: 'a'.repeat(257),
    });
    expect(r.success).toBe(false);
  });

  it('邮箱超过 254 字符应拒绝', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: `${'a'.repeat(249)}@b.com`,
      password: 'password123',
    });
    expect(r.success).toBe(false);
  });

  it('orgName 为可选', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'user@example.com',
      password: 'password123',
      orgName: 'My Org',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.orgName).toBe('My Org');
    }
  });

  it('orgName 为空时可缺省', () => {
    const r = registerSchema.safeParse({
      username: 'newuser',
      email: 'user@example.com',
      password: 'password123',
    });
    expect(r.success).toBe(true);
  });
});
