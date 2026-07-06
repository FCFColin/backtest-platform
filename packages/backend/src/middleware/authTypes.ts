/**
 * 认证中间件共享类型与工具函数
 *
 * 企业理由：jwtAuth、apiKeyAuth、devBypass 三个中间件共享类型定义
 * 与日志辅助函数，集中管理避免跨文件循环依赖。
 */

import crypto from 'crypto';
import type { Request } from 'express';
import { config } from '../config/index.js';

/** 组织内成员角色（owner 为组织创建者） */
export type OrgRole = 'owner' | 'admin' | 'analyst' | 'readonly';

/**
 * 令牌中携带的多租户上下文（ADR-032）。
 *
 * 企业理由：多租户隔离要求每个请求都能确定"当前活跃租户"。将其嵌入 JWT
 * 使无状态鉴权链（中间件）无需额外 DB 往返即可解析租户，再交由 withTenant
 * 在事务内激活 RLS。org_role 为租户内角色，platform_admin 用于运营 SaaS 自身。
 */
export interface TenantContext {
  /** 活跃组织（租户）UUID */
  tenantId?: string;
  /** 在活跃组织内的成员角色 */
  orgRole?: OrgRole;
  /** 平台管理员标记（运营 SaaS 自身，区别于租户内 admin） */
  platformAdmin?: boolean;
}

/** JWT payload 结构 */
export interface JwtPayload {
  /** 用户 ID */
  sub: string;
  /** 用户角色（全局/legacy RBAC 角色，由 org_role 派生以兼容既有 requirePermission） */
  role: 'admin' | 'analyst' | 'readonly';
  /** 活跃组织（租户）UUID — 多租户上下文，未加入任何组织时缺省 */
  tenant_id?: string;
  /** 在活跃组织内的成员角色 */
  org_role?: OrgRole;
  /** 平台管理员标记（运营 SaaS 自身） */
  platform_admin?: boolean;
  /** 签发时间（秒级时间戳） */
  iat: number;
  /** 过期时间（秒级时间戳） */
  exp: number;
}

/** 扩展 Express Request，附加解码后的用户信息 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload | null;
  /** 由租户解析中间件注入的当前活跃租户（组织）UUID，供 withTenant 激活 RLS */
  tenantId?: string;
}

/**
 * 已通过 requireTenant 中间件保证拥有租户上下文的请求。
 * tenantId 为必填（string 而非 string | undefined），
 * 使用 hasTenant() 类型守卫或直接断言以缩小类型。
 */
export interface TenantedRequest extends Request {
  user?: JwtPayload | null;
  tenantId: string;
}

/** Access Token 有效期（秒，从集中配置读取） */
export const ACCESS_TOKEN_EXPIRES_IN_SEC = config.JWT_ACCESS_TTL;

/**
 * 为 pino-http 请求 logger 注入脱敏用户上下文（T-B2）。
 *
 * 企业理由：排障时需关联 user_id/role，但日志中不应出现明文 sub/email。
 */
export function hashUserId(sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  return crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16);
}

export function attachAuthLogContext(req: AuthenticatedRequest): void {
  const sub = req.user?.sub;
  if (!sub) return;
  const reqWithLog = req as AuthenticatedRequest & {
    log?: { child: (b: object) => { child: (b: object) => unknown } };
  };
  if (reqWithLog.log && typeof reqWithLog.log.child === 'function') {
    const userId = hashUserId(sub);
    reqWithLog.log = reqWithLog.log.child({
      user_id: userId,
      role: req.user?.role,
    }) as typeof reqWithLog.log;
  }
}
