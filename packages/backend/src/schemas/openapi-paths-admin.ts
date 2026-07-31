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
  AUTH_500_ERR,
  AUTH_NOT_FOUND_ERR,
  PERM_ERR,
  VALIDATION_ERR,
  VALIDATION_CONFLICT_ERR,
  UPDATE_ERR,
  ID_ERR,
  WITH_ID_PARAM,
  USER_ROLE_PARAM,
  ROLE_BODY,
  TEST_EXTRA,
} from './openapi-paths-shared.js';

function registerAdminEndpoints(): void {
  sec('get', '/admin/stats', 'admin', '仪表盘统计', PERM_ERR);
  sec('get', '/admin/system', 'admin', '系统资源信息', PERM_ERR);
  sec('post', '/admin/keys/rotate', 'admin', '轮换 ADMIN_API_KEY', AUTH_ERR);
  sec('delete', '/admin/keys/{id}', 'admin', '吊销指定密钥', ID_ERR, WITH_ID_PARAM);
  sec('get', '/admin/keys', 'admin', '列出平台密钥', PERM_ERR);
}

function registerAuditLogsPaths(): void {
  sec('get', '/admin/audit-logs', 'audit-logs', '查询审计日志列表', AUTH_ERR, {
    query: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
      actor: z.string().optional(),
      action: z.string().optional(),
      resource: z.string().optional(),
    }),
  });
  sec('get', '/admin/audit-logs/{id}', 'audit-logs', '查询单条审计日志详情', AUTH_NOT_FOUND_ERR, {
    ...WITH_ID_PARAM,
  });
}

function registerRbacRolePaths(): void {
  sec('get', '/admin/roles', 'rbac', '查询当前租户可分配的全部角色列表', AUTH_ERR);
  sec('post', '/admin/roles', 'rbac', '创建新角色', VALIDATION_CONFLICT_ERR, { body: ROLE_BODY });
  sec('put', '/admin/roles/{id}', 'rbac', '更新角色名称或权限', UPDATE_ERR, {
    ...WITH_ID_PARAM,
    body: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(255).optional(),
      permissions: z.array(z.string()).optional(),
    }),
  });
  sec('delete', '/admin/roles/{id}', 'rbac', '删除自定义角色（软删除）', AUTH_NOT_FOUND_ERR, {
    ...WITH_ID_PARAM,
  });
  sec(
    'get',
    '/admin/roles/{id}/permissions',
    'rbac',
    '查询角色拥有的权限列表',
    AUTH_NOT_FOUND_ERR,
    WITH_ID_PARAM,
  );
  sec('put', '/admin/roles/{id}/permissions', 'rbac', '替换角色的全部权限', UPDATE_ERR, {
    ...WITH_ID_PARAM,
    body: z.object({ permissions: z.array(z.string()) }),
  });
}

function registerRbacUserPaths(): void {
  const userIdParam = z.object({ userId: z.string() });
  sec('get', '/admin/users/{userId}/roles', 'rbac', '查询用户被分配的角色列表', AUTH_ERR, {
    params: userIdParam,
  });
  sec('post', '/admin/users/{userId}/roles', 'rbac', '为用户分配角色（幂等）', VALIDATION_ERR, {
    params: userIdParam,
    body: z.object({ roleIds: z.array(z.string()) }),
  });
  sec(
    'delete',
    '/admin/users/{userId}/roles/{roleId}',
    'rbac',
    '移除用户的某个角色分配',
    AUTH_NOT_FOUND_ERR,
    USER_ROLE_PARAM,
  );
}

function registerHealthPaths(): void {
  pubReg('get', '/health', 'health', '存活探针', [503], '服务存活');
  pubReg('get', '/ready', 'health', '就绪探针', [503], '服务就绪');
  pubReg('get', '/metrics', 'health', 'Prometheus 指标', [], 'Prometheus 文本格式指标');
}

function registerWebhooksPaths(): void {
  sec('get', '/webhooks', 'webhooks', '列出当前组织的 webhook 端点', AUTH_ERR);
  sec('post', '/webhooks', 'webhooks', '创建 webhook 端点', VALIDATION_ERR, {
    body: z.object({
      url: z.string().url(),
      secret: z.string().min(1).max(255),
      description: z.string().optional(),
      subscribedEvents: z.array(z.string()),
    }),
  });
  sec('put', '/webhooks/{id}', 'webhooks', '更新 webhook 端点元数据', UPDATE_ERR, {
    ...WITH_ID_PARAM,
    body: z.object({
      url: z.string().url().optional(),
      description: z.string().optional(),
      subscribedEvents: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }),
  });
  sec('delete', '/webhooks/{id}', 'webhooks', '删除 webhook 端点', AUTH_NOT_FOUND_ERR, {
    ...WITH_ID_PARAM,
  });
  sec('post', '/webhooks/{id}/test', 'webhooks', '发送测试事件', AUTH_NOT_FOUND_ERR, TEST_EXTRA);
  sec('get', '/webhooks/{id}/deliveries', 'webhooks', '查询投递历史', AUTH_NOT_FOUND_ERR, {
    ...WITH_ID_PARAM,
  });
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
  sec('get', '/feature-flags', 'feature-flags', '查询全部功能开关的当前状态', AUTH_500_ERR);
}

export function registerAdminPaths(): void {
  registerAdminEndpoints();
  registerAuditLogsPaths();
  registerRbacRolePaths();
  registerRbacUserPaths();
  registerHealthPaths();
  registerWebhooksPaths();
  registerMiscPaths();
}
