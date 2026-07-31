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

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken 不能为空'),
});

export const switchOrgSchema = z.object({
  orgId: z.string().min(1, 'orgId 不能为空'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'token 不能为空'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('邮箱格式不正确').max(254).trim().toLowerCase(),
});

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'title 不能为空').max(200),
  body: z.string().min(1, 'body 不能为空').max(10000),
  category: z.string().max(50).optional(),
  severity: z.string().max(50).optional(),
});

export const errorReportSchema = z.object({
  type: z.enum(['error', 'vital', 'api_timing', 'component_render', 'page_timing', 'navigation']).optional().default('error'),
  message: z.string().min(1).max(2000).optional(),
  stack: z.string().max(10000).optional(),
  traceId: z.string().max(64).optional(),
  context: z
    .object({
      component: z.string().max(200).optional(),
      action: z.string().max(200).optional(),
      jobId: z.string().max(100).optional(),
    })
    .passthrough()
    .optional(),
  timestamp: z.string().max(50).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  value: z.number().optional(),
  metric: z.string().max(64).optional(),
  endpoint: z.string().max(256).optional(),
  route: z.string().max(256).optional(),
  statusCode: z.number().int().optional(),
  component: z.string().max(256).optional(),
  phase: z.string().max(32).optional(),
});
