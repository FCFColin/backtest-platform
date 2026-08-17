import { z } from 'zod';

export const loginPasswordSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(100).trim(),
  password: z.string().min(1, '密码不能为空').max(256),
});

export const registerSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符').max(50).trim(),
  email: z.string().email('邮箱格式不正确').max(254).trim().toLowerCase(),
  password: z.string().min(12, '密码至少12个字符').max(256),
  orgName: z.string().max(100).trim().optional(),
});

export const switchOrgSchema = z.object({
  orgId: z.string().min(1, 'orgId 不能为空'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'token 不能为空'),
});
