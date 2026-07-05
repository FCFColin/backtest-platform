import { z } from 'zod';

export const loginSchema = z.object({
  apiKey: z.string().min(1, 'API Key 不能为空').max(512, 'API Key 过长'),
});

export const loginPasswordSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(100).trim(),
  password: z.string().min(1, '密码不能为空').max(256),
});

export const registerSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符').max(50).trim(),
  email: z.string().email('邮箱格式不正确').max(254).trim().toLowerCase(),
  password: z.string().min(6, '密码至少6个字符').max(256),
  orgName: z.string().max(100).trim().optional(),
});
