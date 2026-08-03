/**
 * OpenAPI 路径注册 — admin 域（BIG2 拆分）
 *
 * 覆盖 admin 面板、审计日志、RBAC、健康探针、webhook、杂项（公告/错误上报/功能开关）。
 */
import { z } from 'zod';
import {
  sec,
  pubReg,
  AUTH_ERR,
  PERM_ERR,
  VALIDATION_ERR,
  ID_ERR,
  WITH_ID_PARAM,
} from './openapi-paths-shared.js';

function registerAdminEndpoints(): void {
  sec('get', '/admin/stats', 'admin', '仪表盘统计', PERM_ERR);
  sec('get', '/admin/system', 'admin', '系统资源信息', PERM_ERR);
  sec('post', '/admin/keys/rotate', 'admin', '轮换 ADMIN_API_KEY', AUTH_ERR);
  sec('delete', '/admin/keys/{id}', 'admin', '吊销指定密钥', ID_ERR, WITH_ID_PARAM);
  sec('get', '/admin/keys', 'admin', '列出平台密钥', PERM_ERR);
}

function registerHealthPaths(): void {
  pubReg('get', '/health', 'health', '存活探针', [503], '服务存活');
  pubReg('get', '/ready', 'health', '就绪探针', [503], '服务就绪');
  pubReg('get', '/metrics', 'health', 'Prometheus 指标', [], 'Prometheus 文本格式指标');
}

function registerMiscPaths(): void {
  pubReg(
    'get',
    '/announcements',
    'announcements',
    '获取公告列表（公开）',
    [500],
    '当前有效的公告列表',
  );
  sec('post', '/announcements', 'announcements', '发布公告（仅管理员）', VALIDATION_ERR, {
    body: z.object({
      title: z.string().min(1).max(255),
      body: z.string().min(1),
      category: z.enum(['display', 'maintenance', 'other']).optional(),
      severity: z.enum(['debug', 'info', 'warning', 'error']).optional(),
    }),
  });
  pubReg(
    'post',
    '/errors',
    'errors',
    '前端错误上报端点',
    [400, 422, 429, 500],
    undefined,
    z.object({
      type: z.enum(['javascript', 'command']).optional(),
      message: z.string().min(1).max(2048),
      stack: z.string().optional(),
      url: z.string().url().optional(),
      userId: z.string().optional(),
    }),
  );
}

export function registerAdminPaths(): void {
  registerAdminEndpoints();
  registerHealthPaths();
  registerMiscPaths();
}
