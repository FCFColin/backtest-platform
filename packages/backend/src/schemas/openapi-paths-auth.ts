/**
 * OpenAPI 路径注册 —— auth / saas-keys / saas-portfolios / saas-configs /
 * saas-runs / saas-orgs / saas-billing / saas-jobs（D6-002 拆分自 openapi-registry.ts）。
 *
 * 涵盖认证、组织 API Key、租户组合/配置/历史持久化、组织成员管理、
 * Stripe 计费与异步任务查询等用户侧端点。
 */
import { z } from 'zod';
import { reg, idParam } from './openapi-components.js';
import { loginSchema, loginPasswordSchema, registerSchema } from './auth.js';
import {
  portfolioBodySchema,
  savedConfigBodySchema,
  backtestRunBodySchema,
} from './persistence.js';

/** 注册 auth 登录/注册/刷新路径。 */
function registerAuthLoginPaths(): void {
  reg({
    method: 'post',
    path: '/auth/login',
    tag: 'auth',
    summary: 'API Key 登录',
    body: loginSchema,
    okDescription: '返回 accessToken/refreshToken',
    errors: [400, 401, 429],
  });
  reg({
    method: 'post',
    path: '/auth/login/password',
    tag: 'auth',
    summary: '用户名密码登录',
    body: loginPasswordSchema,
    okDescription: '返回 accessToken/refreshToken',
    errors: [400, 401, 422, 429, 500],
  });
  reg({
    method: 'post',
    path: '/auth/register',
    tag: 'auth',
    summary: '注册新用户',
    body: registerSchema,
    errors: [400, 409, 422, 429, 500],
  });
  reg({
    method: 'post',
    path: '/auth/refresh',
    tag: 'auth',
    summary: '刷新访问令牌',
    errors: [400, 401, 500],
  });
}

/** 注册 auth 用户/组织切换路径。 */
function registerAuthUserPaths(): void {
  reg({
    method: 'delete',
    path: '/auth/logout',
    tag: 'auth',
    summary: '登出（吊销刷新令牌）',
    security: true,
    errors: [400, 401],
  });
  reg({
    method: 'get',
    path: '/auth/me',
    tag: 'auth',
    summary: '查询当前用户身份',
    security: true,
    errors: [401],
  });
  reg({
    method: 'get',
    path: '/auth/orgs',
    tag: 'auth',
    summary: '查询可切换组织列表',
    security: true,
    errors: [401],
  });
  reg({
    method: 'post',
    path: '/auth/switch-org',
    tag: 'auth',
    summary: '切换当前组织',
    security: true,
    errors: [400, 401, 403],
  });
  reg({
    method: 'delete',
    path: '/auth/me',
    tag: 'auth',
    summary: '注销账户',
    security: true,
    errors: [401, 500],
  });
  reg({
    method: 'post',
    path: '/auth/verify-email',
    tag: 'auth',
    summary: '邮箱验证',
    errors: [400, 404],
  });
  reg({
    method: 'post',
    path: '/auth/resend-verification',
    tag: 'auth',
    summary: '重发验证邮件',
    security: true,
    errors: [401, 429],
  });
}

/** 注册 saas-keys 路径（按组织 API Key，ADR-033）。 */
function registerSaasKeysPaths(): void {
  reg({
    method: 'post',
    path: '/keys',
    tag: 'saas-keys',
    summary: '创建组织 API Key',
    security: true,
    body: z.object({ name: z.string().max(120) }),
    okDescription: '返回新建 Key（明文仅此一次）',
    errors: [400, 401, 422],
  });
  reg({
    method: 'get',
    path: '/keys',
    tag: 'saas-keys',
    summary: '列出组织 API Key',
    security: true,
    errors: [401],
  });
  reg({
    method: 'delete',
    path: '/keys/{id}',
    tag: 'saas-keys',
    summary: '吊销组织 API Key',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
}

/** 注册 saas-portfolios 路径（租户组合持久化，ADR-034）。 */
function registerSaasPortfoliosPaths(): void {
  reg({
    method: 'get',
    path: '/portfolios',
    tag: 'saas-portfolios',
    summary: '列出已保存组合',
    security: true,
    errors: [401],
  });
  reg({
    method: 'get',
    path: '/portfolios/{id}',
    tag: 'saas-portfolios',
    summary: '查询组合详情',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
  reg({
    method: 'post',
    path: '/portfolios',
    tag: 'saas-portfolios',
    summary: '保存组合',
    security: true,
    body: portfolioBodySchema,
    errors: [400, 401, 422],
  });
  reg({
    method: 'put',
    path: '/portfolios/{id}',
    tag: 'saas-portfolios',
    summary: '更新组合',
    security: true,
    params: idParam(),
    body: portfolioBodySchema,
    errors: [400, 401, 404, 422],
  });
  reg({
    method: 'delete',
    path: '/portfolios/{id}',
    tag: 'saas-portfolios',
    summary: '删除组合',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
}

/** 注册 saas-configs 路径（命名配置持久化，ADR-034）。 */
function registerSaasConfigsPaths(): void {
  // saas-configs
  reg({
    method: 'get',
    path: '/configs',
    tag: 'saas-configs',
    summary: '列出命名配置',
    security: true,
    errors: [401],
  });
  reg({
    method: 'get',
    path: '/configs/{id}',
    tag: 'saas-configs',
    summary: '查询配置详情',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
  reg({
    method: 'post',
    path: '/configs',
    tag: 'saas-configs',
    summary: '保存命名配置',
    security: true,
    body: savedConfigBodySchema,
    errors: [400, 401, 422],
  });
  reg({
    method: 'put',
    path: '/configs/{id}',
    tag: 'saas-configs',
    summary: '更新命名配置',
    security: true,
    params: idParam(),
    body: savedConfigBodySchema,
    errors: [400, 401, 404, 422],
  });
  reg({
    method: 'delete',
    path: '/configs/{id}',
    tag: 'saas-configs',
    summary: '删除命名配置',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
}

/** 注册 saas-runs 路径（回测历史持久化，ADR-034）。 */
function registerSaasRunsPaths(): void {
  // saas-runs
  reg({
    method: 'get',
    path: '/runs',
    tag: 'saas-runs',
    summary: '列出回测历史',
    security: true,
    errors: [401],
  });
  reg({
    method: 'get',
    path: '/runs/{id}',
    tag: 'saas-runs',
    summary: '查询回测历史详情',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
  reg({
    method: 'post',
    path: '/runs',
    tag: 'saas-runs',
    summary: '保存回测历史',
    security: true,
    body: backtestRunBodySchema,
    errors: [400, 401, 422],
  });
  reg({
    method: 'delete',
    path: '/runs/{id}',
    tag: 'saas-runs',
    summary: '删除回测历史',
    security: true,
    params: idParam(),
    errors: [401, 404],
  });
}

/** 注册 saas-orgs 路径（组织与成员，ADR-035）。 */
function registerSaasOrgsPaths(): void {
  reg({
    method: 'get',
    path: '/orgs/current',
    tag: 'saas-orgs',
    summary: '查询当前组织',
    security: true,
    errors: [401],
  });
  reg({
    method: 'patch',
    path: '/orgs/current',
    tag: 'saas-orgs',
    summary: '更新当前组织信息',
    security: true,
    errors: [401, 403, 422],
  });
  reg({
    method: 'get',
    path: '/orgs/members',
    tag: 'saas-orgs',
    summary: '列出组织成员',
    security: true,
    errors: [401],
  });
  reg({
    method: 'patch',
    path: '/orgs/members/{userId}',
    tag: 'saas-orgs',
    summary: '更新成员角色',
    security: true,
    params: idParam('userId'),
    errors: [401, 403, 404],
  });
  reg({
    method: 'delete',
    path: '/orgs/members/{userId}',
    tag: 'saas-orgs',
    summary: '移除成员',
    security: true,
    params: idParam('userId'),
    errors: [401, 403, 404],
  });
  reg({
    method: 'get',
    path: '/orgs/invitations',
    tag: 'saas-orgs',
    summary: '列出组织邀请',
    security: true,
    errors: [401, 403],
  });
  reg({
    method: 'post',
    path: '/orgs/invitations',
    tag: 'saas-orgs',
    summary: '创建组织邀请',
    security: true,
    errors: [401, 403, 422],
  });
  reg({
    method: 'post',
    path: '/orgs/invitations/accept',
    tag: 'saas-orgs',
    summary: '接受组织邀请',
    security: true,
    errors: [401, 404, 409],
  });
  reg({
    method: 'delete',
    path: '/orgs/invitations/{id}',
    tag: 'saas-orgs',
    summary: '撤销组织邀请',
    security: true,
    params: idParam(),
    errors: [401, 403, 404],
  });
}

/** 注册 saas-billing / saas-jobs 路径（Stripe 计费 + 异步任务，ADR-036/019）。 */
function registerSaasBillingJobsPaths(): void {
  reg({
    method: 'get',
    path: '/billing/subscription',
    tag: 'saas-billing',
    summary: '查询当前订阅',
    security: true,
    errors: [401],
  });
  reg({
    method: 'post',
    path: '/billing/checkout',
    tag: 'saas-billing',
    summary: '创建 Stripe Checkout Session',
    security: true,
    errors: [401, 422, 503],
  });
  reg({
    method: 'post',
    path: '/billing/portal',
    tag: 'saas-billing',
    summary: '创建 Billing Portal Session',
    security: true,
    errors: [401, 503],
  });
  reg({
    method: 'get',
    path: '/jobs/{id}',
    tag: 'saas-jobs',
    summary: '查询异步任务状态',
    security: true,
    params: idParam(),
    errors: [401, 403, 404],
  });
}

/**
 * 注册 auth / saas-keys / saas-portfolios / saas-configs / saas-runs /
 * saas-orgs / saas-billing / saas-jobs 路径。
 */
export function registerAuthPaths(): void {
  registerAuthLoginPaths();
  registerAuthUserPaths();
  registerSaasKeysPaths();
  registerSaasPortfoliosPaths();
  registerSaasConfigsPaths();
  registerSaasRunsPaths();
  registerSaasOrgsPaths();
  registerSaasBillingJobsPaths();
}