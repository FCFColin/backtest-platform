/**
 * 租户解析中间件（多租户隔离强制点的请求侧，ADR-032）
 *
 * 企业理由：JWT 中携带 tenant_id（活跃组织）后，需要一个统一中间件把它解析到
 * req.tenantId，供后续路由用 withTenant(req.tenantId, ...) 在事务内激活 Postgres RLS。
 * 隔离的最终保证由数据库 RLS 提供，本中间件只负责"把租户从令牌搬到请求上下文"。
 *
 * 设计取舍：
 * - 不在中间件层直接 withTenant 包裹整个请求——express 的请求生命周期与单个事务
 *   不对齐（一个请求可能多次查询，长事务还会占用连接）。因此仅解析 tenantId，
 *   由各路由按需在数据访问点开启租户事务。
 * - resolveTenant 为软解析：无租户上下文也放行（部分端点如健康检查、org 列表、
 *   onboarding 在尚无活跃组织时也需访问）。强制要求租户的路由再叠加 requireTenant。
 */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './jwtAuth.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** UUID v4 形态校验（防御性，真正的隔离由 RLS 保证） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 软解析租户上下文：将 JWT 的 tenant_id 解析到 req.tenantId。
 *
 * 无 tenant_id（用户尚未加入任何组织）或格式非法时不报错，仅不设置 req.tenantId，
 * 由下游 requireTenant 决定是否强制。须在 jwtAuth/optionalJwtAuth 之后挂载。
 */
export function resolveTenant(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const tenantId = req.user?.tenant_id;
  if (typeof tenantId === 'string' && UUID_RE.test(tenantId)) {
    req.tenantId = tenantId;
  } else if (tenantId) {
    logger.warn({ path: req.path }, '[tenantContext] JWT tenant_id 格式非法，已忽略');
  }
  next();
}

/**
 * 强制要求已解析出租户上下文，否则拒绝请求。
 *
 * 企业理由：租户作用域的数据端点（portfolios/configs/backtest-runs 等）若在
 * 无租户上下文时执行，RLS 会因 app.current_tenant_id 未设置而读零行/拒写——
 * 与其返回令人困惑的空结果，不如在入口显式 400，提示用户先选择/创建组织。
 *
 * 须挂在 resolveTenant 之后。
 */
export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    sendProblem(res, 400, 'NO_ACTIVE_TENANT', 'No active tenant', {
      detail: '当前会话未关联活跃组织，请先选择或创建组织（POST /api/v1/auth/switch-org）。',
    });
    return;
  }
  next();
}
