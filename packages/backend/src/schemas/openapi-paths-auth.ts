import {
  sec,
  pubReg,
  registerCrud,
  AUTH_500_ERR,
  ID_ERR,
  NOT_FOUND_ERR,
  PERM_ERR,
  WITH_ID_PARAM,
  WITH_USER_ID_PARAM,
  KEY_BODY,
} from './openapi-paths-shared.js';
import { loginPasswordSchema, registerSchema } from './tactical.js';
import { portfolioBodySchema, savedConfigBodySchema, backtestRunBodySchema } from './backtest.js';

function registerAuthLoginPaths(): void {
  pubReg(
    'post',
    '/auth/login/password',
    'auth',
    '用户名密码登录',
    [400, 401, 422, 429, 500],
    '返回 accessToken/refreshToken',
    loginPasswordSchema,
  );
  pubReg(
    'post',
    '/auth/register',
    'auth',
    '注册新用户',
    [400, 409, 422, 429, 500],
    undefined,
    registerSchema,
  );
  pubReg('post', '/auth/refresh', 'auth', '刷新访问令牌', [400, 401, 500]);
}

function registerAuthUserPaths(): void {
  sec('delete', '/auth/logout', 'auth', '登出（吊销刷新令牌）', [400, 401]);
  sec('get', '/auth/me', 'auth', '查询当前用户身份', [401]);
  sec('get', '/auth/orgs', 'auth', '查询可切换组织列表', [401]);
  sec('post', '/auth/switch-org', 'auth', '切换当前组织', [400, 401, 403]);
  sec('delete', '/auth/me', 'auth', '注销账户', AUTH_500_ERR);
  pubReg('post', '/auth/verify-email', 'auth', '邮箱验证', [400, 404]);
  sec('post', '/auth/resend-verification', 'auth', '重发验证邮件', [401, 429]);
}

function registerSaasKeysPaths(): void {
  sec('post', '/keys', 'saas-keys', '创建组织 API Key', [400, 401, 422], { body: KEY_BODY });
  sec('get', '/keys', 'saas-keys', '列出组织 API Key', [401]);
  sec('delete', '/keys/{id}', 'saas-keys', '吊销组织 API Key', NOT_FOUND_ERR, WITH_ID_PARAM);
}

function registerSaasPortfoliosPaths(): void {
  registerCrud({
    tag: 'saas-portfolios',
    basePath: '/portfolios',
    listSummary: '列出已保存组合',
    getSummary: '查询组合详情',
    createSummary: '保存组合',
    createBody: portfolioBodySchema,
    updateSummary: '更新组合',
    updateBody: portfolioBodySchema,
    deleteSummary: '删除组合',
  });
}

function registerSaasConfigsPaths(): void {
  registerCrud({
    tag: 'saas-configs',
    basePath: '/configs',
    listSummary: '列出命名配置',
    getSummary: '查询配置详情',
    createSummary: '保存命名配置',
    createBody: savedConfigBodySchema,
    updateSummary: '更新命名配置',
    updateBody: savedConfigBodySchema,
    deleteSummary: '删除命名配置',
  });
}

function registerSaasRunsPaths(): void {
  registerCrud({
    tag: 'saas-runs',
    basePath: '/runs',
    listSummary: '列出回测历史',
    getSummary: '查询回测历史详情',
    createSummary: '保存回测历史',
    createBody: backtestRunBodySchema,
    deleteSummary: '删除回测历史',
  });
}

function registerSaasOrgsPaths(): void {
  sec('get', '/orgs/members', 'saas-orgs', '列出组织成员', [401]);
  sec('patch', '/orgs/members/{userId}', 'saas-orgs', '更新成员角色', ID_ERR, WITH_USER_ID_PARAM);
  sec('delete', '/orgs/members/{userId}', 'saas-orgs', '移除成员', ID_ERR, WITH_USER_ID_PARAM);
  sec('get', '/orgs/invitations', 'saas-orgs', '列出组织邀请', PERM_ERR);
  sec('post', '/orgs/invitations', 'saas-orgs', '创建组织邀请', [401, 403, 422]);
  sec('post', '/orgs/invitations/accept', 'saas-orgs', '接受组织邀请', [401, 404, 409]);
  sec('delete', '/orgs/invitations/{id}', 'saas-orgs', '撤销组织邀请', ID_ERR, WITH_ID_PARAM);
}

function registerSaasBillingJobsPaths(): void {
  sec('get', '/billing/subscription', 'saas-billing', '查询当前订阅', [401]);
  sec('post', '/billing/checkout', 'saas-billing', '创建 Stripe Checkout Session', [401, 422, 503]);
  sec('post', '/billing/portal', 'saas-billing', '创建 Billing Portal Session', [401, 503]);
  sec('get', '/jobs/{id}', 'saas-jobs', '查询异步任务状态', ID_ERR, WITH_ID_PARAM);
}

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
