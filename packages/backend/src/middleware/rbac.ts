/**
 * RBAC（基于角色的访问控制）权限模型
 *
 * 企业理由：认证只解决"你是谁"，授权解决"你能做什么"。
 * 多租户 / 团队协作场景下，不同角色应有不同操作边界：
 * - 管理员可执行危险操作（全量更新、删除数据）
 * - 分析师可运行回测、查看数据
 * - 只读用户仅能查看结果
 * 无 RBAC 时任何认证用户等同于管理员，违反最小权限原则。
 *
 * 权衡：
 * - 采用粗粒度角色（3 种）而非细粒度权限组，降低配置复杂度。
 *   如需更细粒度控制（如"只能回测特定策略"），需扩展为 ABAC 模型。
 * - 权限检查在中间件层执行，路由声明式标注所需权限，
 *   而非在每个 handler 内手动检查，减少遗漏风险。
 */

import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './jwtAuth.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordAuthFailure } from '../utils/metrics.js';

// ---------------------------------------------------------------------------
// 角色枚举
// ---------------------------------------------------------------------------

/**
 * 系统角色
 *
 * - ADMIN：管理员，拥有全部权限
 * - ANALYST：分析师，可运行回测和管理数据
 * - READONLY：只读用户，仅能查看数据
 */
export enum Role {
  ADMIN = 'admin',
  ANALYST = 'analyst',
  READONLY = 'readonly',
}

// ---------------------------------------------------------------------------
// 权限枚举
// ---------------------------------------------------------------------------

/**
 * 系统权限
 *
 * 企业理由：权限是细粒度的操作能力，角色是权限的集合。
 * 将权限与角色解耦，未来可灵活调整角色-权限映射而无需修改业务代码。
 */
export enum Permission {
  /** 运行回测 */
  BACKTEST_RUN = 'backtest:run',
  /** 管理数据（全量/增量更新、刷新宇宙等） */
  DATA_MANAGE = 'data:manage',
  /** 查看数据（标的列表、统计等） */
  DATA_READ = 'data:read',
  /** 管理后台访问 */
  ADMIN_ACCESS = 'admin:access',
  /** 优化器运行 */
  OPTIMIZER_RUN = 'optimizer:run',
  /** 信号查看 */
  SIGNAL_READ = 'signal:read',
  /** 策略管理 */
  STRATEGY_MANAGE = 'strategy:manage',
}

// ---------------------------------------------------------------------------
// 角色-权限映射
// ---------------------------------------------------------------------------

/**
 * 角色权限映射表
 *
 * 企业理由：集中定义角色拥有的权限集合，而非在路由中硬编码角色判断。
 * 新增角色或权限时只需修改此映射表。
 *
 * 权衡：ADMIN 拥有全部权限是简化处理，生产环境可能需要
 * 更细粒度的超级管理员与普通管理员区分。
 */
const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  [Role.ADMIN]: new Set(Object.values(Permission)),
  [Role.ANALYST]: new Set([
    Permission.BACKTEST_RUN,
    Permission.DATA_READ,
    Permission.DATA_MANAGE,
    Permission.OPTIMIZER_RUN,
    Permission.SIGNAL_READ,
    Permission.STRATEGY_MANAGE,
  ]),
  [Role.READONLY]: new Set([Permission.DATA_READ, Permission.SIGNAL_READ]),
};

// ---------------------------------------------------------------------------
// 权限检查函数
// ---------------------------------------------------------------------------

/**
 * 检查指定角色是否拥有某权限
 *
 * @param role - 用户角色
 * @param permission - 所需权限
 * @returns 是否拥有权限
 */
function hasPermission(role: Role | string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  if (!perms) return false;
  return perms.has(permission);
}

/**
 * 解析请求的有效（org 作用域）RBAC 角色。
 *
 * 企业理由（ADR-032）：多租户下角色应以"用户在当前活跃组织内的成员角色"为准，
 * 而非历史的全局角色。JWT 中携带 org_role（组织内角色），此处优先采用并把组织
 * 创建者 owner 归并为 admin（拥有租户内全部权限）。无 org_role 时回退到 legacy
 * 全局 role，保证迁移期/无组织令牌仍可工作。
 *
 * @param user - 解码后的 JWT 用户上下文
 * @returns 用于权限判定的有效角色字符串
 */
function effectiveRole(user: NonNullable<AuthenticatedRequest['user']>): string {
  const orgRole = user.org_role;
  if (orgRole) {
    return orgRole === 'owner' ? Role.ADMIN : orgRole;
  }
  return user.role;
}

// ---------------------------------------------------------------------------
// Express 中间件
// ---------------------------------------------------------------------------

/**
 * 权限检查中间件工厂函数
 *
 * 企业理由：在路由声明时标注所需权限，中间件自动校验，
 * 避免在每个 handler 中重复编写权限判断逻辑。
 * 声明式权限标注也便于生成 API 文档和审计日志。
 *
 * 使用方式：
 * ```ts
 * router.post('/update/full', requirePermission(Permission.DATA_MANAGE), handler);
 * ```
 *
 * 权衡：中间件要求 req.user 必须由前置认证中间件（jwtAuth）注入，
 * 路由注册顺序必须为 auth → rbac → handler，否则 req.user 为 undefined。
 * 此约束通过约定保证，未做编译期检查。
 *
 * @param permission - 路由所需权限
 * @returns Express 中间件
 */
function logRbac(
  level: 'info' | 'warn',
  req: AuthenticatedRequest,
  permission: Permission,
  message: string,
  extra?: Record<string, unknown>,
) {
  logger[level](
    {
      middleware: 'rbac',
      permission,
      userId: req.user?.sub,
      role: req.user?.role,
      path: req.path,
      requestId: req.id,
      ...extra,
    },
    `[rbac] ${message}`,
  );
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    logRbac('info', req, permission, '权限检查');

    if (!req.user) {
      recordAuthFailure(req.path, 'missing_auth');
      sendProblem(res, 401, 'MISSING_AUTH', 'Unauthorized', { detail: '请求未经认证，请先登录' });
      return;
    }

    if (req.user.platform_admin === true) {
      logRbac('info', req, permission, '平台管理员放行', { platformAdmin: true });
      next();
      return;
    }

    const userRole = effectiveRole(req.user) as Role;

    if (!hasPermission(userRole, permission)) {
      logRbac('warn', req, permission, '权限不足，访问拒绝');
      recordAuthFailure(req.path, 'insufficient_permission');
      sendProblem(res, 403, 'INSUFFICIENT_PERMISSION', 'Forbidden', {
        detail: `角色 "${userRole}" 缺少权限 "${permission}"`,
      });
      return;
    }

    logRbac('info', req, permission, '权限检查通过');
    next();
  };
}
