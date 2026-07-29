/**
 * OpenAPI 路径注册 —— admin / admin-keys / audit-logs / rbac / health /
 * webhooks / announcements / errors / feature-flags
 * （D6-002 拆分自 openapi-registry.ts）。
 *
 * 涵盖管理后台、平台密钥轮换、审计日志、RBAC 角色权限、
 * 健康探针、Webhook 端点、公告、前端错误上报与功能开关。
 */
import { z } from 'zod';
import { reg, idParam } from './openapi-components.js';

/** 注册 admin 路径（仪表盘/系统资源/平台密钥轮换与吊销）。 */
function registerAdminEndpoints(): void {
  reg({
    method: 'get',
    path: '/admin/stats',
    tag: 'admin',
    summary: '仪表盘统计',
    security: true,
    errors: [401, 403],
  });
  reg({
    method: 'get',
    path: '/admin/system',
    tag: 'admin',
    summary: '系统资源信息',
    security: true,
    errors: [401, 403],
  });
  reg({
    method: 'post',
    path: '/admin/keys/rotate',
    tag: 'admin',
    summary: '轮换 ADMIN_API_KEY',
    security: true,
    errors: [401, 403, 500],
  });
  reg({
    method: 'delete',
    path: '/admin/keys/{id}',
    tag: 'admin',
    summary: '吊销指定密钥',
    security: true,
    params: idParam(),
    errors: [401, 403, 404],
  });
  reg({
    method: 'get',
    path: '/admin/keys',
    tag: 'admin',
    summary: '列出平台密钥',
    security: true,
    errors: [401, 403],
  });
}

/** 注册 admin/audit-logs 路径（P2-03 不可篡改的审计存储）。 */
function registerAuditLogsPaths(): void {
  reg({
    method: 'get',
    path: '/admin/audit-logs',
    tag: 'audit-logs',
    summary: '查询审计日志列表（支持按时间范围、actor、action、resource 等条件过滤，分页查询）',
    security: true,
    query: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
      actor: z.string().optional(),
      action: z.string().optional(),
      resource: z.string().optional(),
    }),
    okDescription: '审计日志的分页结果，每条含 id（审计事件 id）与 actor（执行者）与 action 与 resource',
    errors: [401, 403, 500],
  });
  reg({
    method: 'get',
    path: '/admin/audit-logs/{id}',
    tag: 'audit-logs',
    summary: '查询单条审计日志的详情（含完整的请求体与响应体的 JSON 元数据）',
    security: true,
    params: idParam(),
    okDescription: '单条审计日志的详情（含请求的 metadata（含 user agent）与响应的状态码与响应体）',
    errors: [401, 403, 404, 500],
  });
}

/** 注册 rbac 角色路径（角色 CRUD 与权限替换，ADR-017）。 */
function registerRbacRolePaths(): void {
  reg({
    method: 'get',
    path: '/admin/roles',
    tag: 'rbac',
    summary: '查询当前租户可分配的全部角色列表及其关联的权限名称。',
    security: true,
    okDescription: '当前租户可分配的角色列表，每个角色含 id（自动生成的 v4 uuid）与 name 与 description 与 permissions',
    errors: [401, 403, 500],
  });
  reg({
    method: 'post',
    path: '/admin/roles',
    tag: 'rbac',
    summary: '创建一个新角色（含 name 与 description，以及关联的 int array permissions 数组）',
    security: true,
    body: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(255).optional(),
      permissions: z.array(z.string()),
    }),
    okDescription: '新建成功的角色含 id 与 name',
    errors: [400, 401, 403, 422, 409, 500],
  });
  reg({
    method: 'put',
    path: '/admin/roles/{id}',
    tag: 'rbac',
    summary: '更新角色名称或权限（inner join p_name 查询角色名，以及权限管理的 int array permissions 字段）',
    security: true,
    params: idParam(),
    body: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(255).optional(),
      permissions: z.array(z.string()).optional(),
    }),
    okDescription: '更新后的角色含最新的 name 与 description',
    errors: [400, 401, 403, 404, 422, 500],
  });
  reg({
    method: 'delete',
    path: '/admin/roles/{id}',
    tag: 'rbac',
    summary: '删除自定义角色（软删除，不影响已分配该角色的用户。删除系统内置角色将返回 409）',
    security: true,
    params: idParam(),
    okDescription: '删除成功（含已删除的角色 id）',
    errors: [401, 403, 404, 500],
  });
  reg({
    method: 'get',
    path: '/admin/roles/{id}/permissions',
    tag: 'rbac',
    summary: '查询角色拥有的权限列表',
    security: true,
    params: idParam(),
    okDescription: '角色关联的权限 id 列表（int array）以及对应的 api endpoint 名称列表',
    errors: [401, 403, 404, 500],
  });
  reg({
    method: 'put',
    path: '/admin/roles/{id}/permissions',
    tag: 'rbac',
    summary: '替换角色的全部权限（传入 int array permissions 数组，完全替换原有权限）',
    security: true,
    params: idParam(),
    body: z.object({
      permissions: z.array(z.string()),
    }),
    okDescription: '更新后的角色含最新的权限列表',
    errors: [400, 401, 403, 404, 422, 500],
  });
}

/** 注册 rbac 用户角色路径（用户角色分配与移除，ADR-017）。 */
function registerRbacUserPaths(): void {
  reg({
    method: 'get',
    path: '/admin/users/{userId}/roles',
    tag: 'rbac',
    summary: '查询用户被分配的角色列表与对应的 api endpoint 列表',
    security: true,
    params: z.object({ userId: z.string() }),
    okDescription: '当前租户的用户角色列表（含角色名称与 api endpoint 名称）',
    errors: [401, 403, 500],
  });
  reg({
    method: 'post',
    path: '/admin/users/{userId}/roles',
    tag: 'rbac',
    summary: '为用户分配一个或多个角色（传入 array roleIds，幂等：重复分配不会产生副作用的批量更新）',
    security: true,
    params: z.object({ userId: z.string() }),
    body: z.object({
      roleIds: z.array(z.string()),
    }),
    okDescription: '更新后的角色列表',
    errors: [400, 401, 403, 422, 500],
  });
  reg({
    method: 'delete',
    path: '/admin/users/{userId}/roles/{roleId}',
    tag: 'rbac',
    summary: '移除用户的某个角色分配（user_role 表的联合主键 userId + roleId，不影响其他角色分配）',
    security: true,
    params: z.object({ userId: z.string(), roleId: z.string() }),
    okDescription: '移除成功后的用户剩余的角色列表',
    errors: [401, 403, 404, 500],
  });
}

/** 注册 health 路径（存活/就绪探针 + Prometheus 指标）。 */
function registerHealthPaths(): void {
  // health（无需认证，错误响应豁免）
  reg({
    method: 'get',
    path: '/health',
    tag: 'health',
    summary: '存活探针',
    okDescription: '服务存活',
    errors: [503],
  });
  reg({
    method: 'get',
    path: '/ready',
    tag: 'health',
    summary: '就绪探针',
    okDescription: '服务就绪',
    errors: [503],
  });
  reg({
    method: 'get',
    path: '/metrics',
    tag: 'health',
    summary: 'Prometheus 指标',
    okDescription: 'Prometheus 文本格式指标',
    errors: [],
  });
}

/** 注册 webhooks 路径（事件投递终点 CRUD + 测试 + 投递历史）。 */
function registerWebhooksPaths(): void {
  // webhooks（每个组织的事件投递终点，仅返回脱敏后的 endpoint 元数据）
  reg({
    method: 'get',
    path: '/webhooks',
    tag: 'webhooks',
    summary: '列出当前组织的 webhook 端点',
    security: true,
    okDescription: '当前组织的 webhook 端点列表（不含 secret）',
    errors: [401, 403, 500],
  });
  reg({
    method: 'post',
    path: '/webhooks',
    tag: 'webhooks',
    summary: '创建 webhook 端点（自动生成签名 secret 时使用请求体提供的 secret）',
    security: true,
    body: z.object({
      url: z.string().url(),
      secret: z.string().min(1).max(255),
      description: z.string().optional(),
      subscribedEvents: z.array(z.string()),
    }),
    okDescription: '新建成功的 webhook 含一个 id， description，isActive，subscribedEvents 等',
    errors: [400, 401, 403, 422, 500],
  });
  reg({
    method: 'put',
    path: '/webhooks/{id}',
    tag: 'webhooks',
    summary: '更新 webhook 端点元数据（url/description/subscribed_events/is_active）',
    security: true,
    params: idParam(),
    body: z.object({
      url: z.string().url().optional(),
      description: z.string().optional(),
      subscribedEvents: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }),
    okDescription: '更新后的 webhook 端点',
    errors: [400, 401, 403, 404, 422, 500],
  });
  reg({
    method: 'delete',
    path: '/webhooks/{id}',
    tag: 'webhooks',
    summary: '删除 webhook 端点（级联删除投递历史，由 FK ON DELETE CASCADE 保证）',
    security: true,
    params: idParam(),
    okDescription: '删除成功的 webhook id 与 deleted: true 标记（表示该 id 的端点已从当前组织删除）',
    errors: [401, 403, 404, 500],
  });
  reg({
    method: 'post',
    path: '/webhooks/{id}/test',
    tag: 'webhooks',
    summary: '发送测试事件：立即投递一次 WebhookTest 事件并记录投递历史',
    security: true,
    params: idParam(),
    body: z.object({}),
    okDescription: '测试投递结果（deliveryId）+ delivered（是否成功）+ responseCode + responseBody',
    errors: [401, 403, 404, 500],
  });
  reg({
    method: 'get',
    path: '/webhooks/{id}/deliveries',
    tag: 'webhooks',
    summary: '查询投递历史（最近 100 条，按创建时间倒序）',
    security: true,
    params: idParam(),
    okDescription: '投递记录列表，每条含 id（投递记录 id）与 delivery_responseCode.json 形式的元数据',
    errors: [401, 403, 404, 500],
  });
}

/** 注册 announcements / errors / feature-flags 路径。 */
function registerMiscPaths(): void {
  // announcements（公告系统，管理员发布、所有用户查看，无需认证的公开列表）
  reg({
    method: 'get',
    path: '/announcements',
    tag: 'announcements',
    summary: '获取公告列表（公开，无需认证）',
    okDescription: '当前有效的公告列表（不超过 50 条）按 publishedAt 倒序',
    errors: [500],
  });
  reg({
    method: 'post',
    path: '/announcements',
    tag: 'announcements',
    summary: '发布公告（仅管理员）',
    security: true,
    body: z.object({
      title: z.string().min(1).max(255),
      body: z.string().min(1),
      category: z.enum(['display', 'maintenance', 'other']).optional(),
      severity: z.enum(['debug', 'info', 'warning', 'error']).optional(),
    }),
    okDescription: '新建成功的公告含自动生成的 id 与 publishedAt',
    errors: [400, 401, 403, 422, 500],
  });
  // errors（前端错误上报端点，无需认证，由全局 apiLimiter 进行速率限制）
  reg({
    method: 'post',
    path: '/errors',
    tag: 'errors',
    summary: '前端错误上报端点（用于收集客户端发生的未知与未处理的 javascript 错误，command 与 network 错误，以及渲染阶段的 react 错误）',
    body: z.object({
      type: z.enum(['javascript', 'command']).optional(),
      message: z.string().min(1).max(2048),
      stack: z.string().optional(),
      url: z.string().url().optional(),
      userId: z.string().optional(),
    }),
    okDescription: '删除成功的用户 id 与 deleted: true 标记（表示错误已记录到后台日志）',
    errors: [400, 422, 429, 500],
  });
  // feature-flags（功能开关的查询端点，用于控制前端功能的逐步发布）
  reg({
    method: 'get',
    path: '/feature-flags',
    tag: 'feature-flags',
    summary: '查询全部功能开关的当前状态（含是否启用、描述、以及全局或按用户维度的配置）',
    security: true,
    okDescription: '功能开关列表，每个开关含 key（字符串标识符）与 enabled（是否启用）以及 description',
    errors: [401, 500],
  });
}

/**
 * 注册 admin / admin-keys / audit-logs / rbac / health / webhooks /
 * announcements / errors / feature-flags 路径。
 */
export function registerAdminPaths(): void {
  registerAdminEndpoints();
  registerAuditLogsPaths();
  registerRbacRolePaths();
  registerRbacUserPaths();
  registerHealthPaths();
  registerWebhooksPaths();
  registerMiscPaths();
}