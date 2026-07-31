import { z } from 'zod';
import { reg, idParam, AcceptedEnvelope } from './openapi-components.js';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
  portfolioSeriesSchema,
} from './backtest.js';
import {
  searchQuerySchema,
  historyQuerySchema,
  tickerListQuerySchema,
  tickerSearchQuerySchema,
} from './data.js';
import { backtestOptimizerSchema } from './optimizer.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from './signal.js';
import {
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalAlertSchema,
  tacticalGridSearchSchema,
} from './tactical.js';
import { pcaAnalyzeSchema, letfAnalyzeSchema, goalOptimizerSchema } from './analysisSchemas.js';
import { loginSchema, loginPasswordSchema, registerSchema } from './misc-schemas.js';
import {
  portfolioBodySchema,
  savedConfigBodySchema,
  backtestRunBodySchema,
} from './persistence.js';
type RegOpts = Parameters<typeof reg>[0];

// eslint-disable-next-line max-params
function sec(
  method: RegOpts['method'],
  path: string,
  tag: string,
  summary: string,
  errors: number[],
  extra: Partial<Omit<RegOpts, 'method' | 'path' | 'tag' | 'summary' | 'errors' | 'security'>> = {},
): void {
  reg({ method, path, tag, summary, errors, security: true, ...extra });
}

interface CrudOpts {
  tag: string;
  basePath: string;
  listSummary: string;
  getSummary: string;
  createSummary?: string;
  createBody?: z.ZodType;
  updateSummary?: string;
  updateBody?: z.ZodType;
  deleteSummary: string;
}

function registerCrud(opts: CrudOpts): void {
  sec('get', opts.basePath, opts.tag, opts.listSummary, [401]);
  sec('get', `${opts.basePath}/{id}`, opts.tag, opts.getSummary, [401, 404], { params: idParam() });
  if (opts.createBody)
    sec('post', opts.basePath, opts.tag, opts.createSummary!, [400, 401, 422], {
      body: opts.createBody,
    });
  if (opts.updateBody)
    sec('put', `${opts.basePath}/{id}`, opts.tag, opts.updateSummary!, [400, 401, 404, 422], {
      params: idParam(),
      body: opts.updateBody,
    });
  sec('delete', `${opts.basePath}/{id}`, opts.tag, opts.deleteSummary, [401, 404], {
    params: idParam(),
  });
}

function registerAdminEndpoints(): void {
  sec('get', '/admin/stats', 'admin', '仪表盘统计', [401, 403]);
  sec('get', '/admin/system', 'admin', '系统资源信息', [401, 403]);
  sec('post', '/admin/keys/rotate', 'admin', '轮换 ADMIN_API_KEY', [401, 403, 500]);
  sec('delete', '/admin/keys/{id}', 'admin', '吊销指定密钥', [401, 403, 404], {
    params: idParam(),
  });
  sec('get', '/admin/keys', 'admin', '列出平台密钥', [401, 403]);
}

function registerAuditLogsPaths(): void {
  sec('get', '/admin/audit-logs', 'audit-logs', '查询审计日志列表', [401, 403, 500], {
    query: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
      actor: z.string().optional(),
      action: z.string().optional(),
      resource: z.string().optional(),
    }),
  });
  sec('get', '/admin/audit-logs/{id}', 'audit-logs', '查询单条审计日志详情', [401, 403, 404, 500], {
    params: idParam(),
  });
}

function registerRbacRolePaths(): void {
  sec('get', '/admin/roles', 'rbac', '查询当前租户可分配的全部角色列表', [401, 403, 500]);
  sec('post', '/admin/roles', 'rbac', '创建新角色', [400, 401, 403, 422, 409, 500], {
    body: z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(255).optional(),
      permissions: z.array(z.string()),
    }),
  });
  sec('put', '/admin/roles/{id}', 'rbac', '更新角色名称或权限', [400, 401, 403, 404, 422, 500], {
    params: idParam(),
    body: z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(255).optional(),
      permissions: z.array(z.string()).optional(),
    }),
  });
  sec('delete', '/admin/roles/{id}', 'rbac', '删除自定义角色（软删除）', [401, 403, 404, 500], {
    params: idParam(),
  });
  sec(
    'get',
    '/admin/roles/{id}/permissions',
    'rbac',
    '查询角色拥有的权限列表',
    [401, 403, 404, 500],
    { params: idParam() },
  );
  sec(
    'put',
    '/admin/roles/{id}/permissions',
    'rbac',
    '替换角色的全部权限',
    [400, 401, 403, 404, 422, 500],
    {
      params: idParam(),
      body: z.object({ permissions: z.array(z.string()) }),
    },
  );
}

function registerRbacUserPaths(): void {
  const userIdParam = z.object({ userId: z.string() });
  sec('get', '/admin/users/{userId}/roles', 'rbac', '查询用户被分配的角色列表', [401, 403, 500], {
    params: userIdParam,
  });
  sec(
    'post',
    '/admin/users/{userId}/roles',
    'rbac',
    '为用户分配角色（幂等）',
    [400, 401, 403, 422, 500],
    { params: userIdParam, body: z.object({ roleIds: z.array(z.string()) }) },
  );
  sec(
    'delete',
    '/admin/users/{userId}/roles/{roleId}',
    'rbac',
    '移除用户的某个角色分配',
    [401, 403, 404, 500],
    { params: z.object({ userId: z.string(), roleId: z.string() }) },
  );
}

function registerHealthPaths(): void {
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

function registerWebhooksPaths(): void {
  sec('get', '/webhooks', 'webhooks', '列出当前组织的 webhook 端点', [401, 403, 500]);
  sec('post', '/webhooks', 'webhooks', '创建 webhook 端点', [400, 401, 403, 422, 500], {
    body: z.object({
      url: z.string().url(),
      secret: z.string().min(1).max(255),
      description: z.string().optional(),
      subscribedEvents: z.array(z.string()),
    }),
  });
  sec(
    'put',
    '/webhooks/{id}',
    'webhooks',
    '更新 webhook 端点元数据',
    [400, 401, 403, 404, 422, 500],
    {
      params: idParam(),
      body: z.object({
        url: z.string().url().optional(),
        description: z.string().optional(),
        subscribedEvents: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }),
    },
  );
  sec('delete', '/webhooks/{id}', 'webhooks', '删除 webhook 端点', [401, 403, 404, 500], {
    params: idParam(),
  });
  sec('post', '/webhooks/{id}/test', 'webhooks', '发送测试事件', [401, 403, 404, 500], {
    params: idParam(),
    body: z.object({}),
  });
  sec('get', '/webhooks/{id}/deliveries', 'webhooks', '查询投递历史', [401, 403, 404, 500], {
    params: idParam(),
  });
}

function registerMiscPaths(): void {
  reg({
    method: 'get',
    path: '/announcements',
    tag: 'announcements',
    summary: '获取公告列表（公开）',
    okDescription: '当前有效的公告列表',
    errors: [500],
  });
  sec(
    'post',
    '/announcements',
    'announcements',
    '发布公告（仅管理员）',
    [400, 401, 403, 422, 500],
    {
      body: z.object({
        title: z.string().min(1).max(255),
        body: z.string().min(1),
        category: z.enum(['display', 'maintenance', 'other']).optional(),
        severity: z.enum(['debug', 'info', 'warning', 'error']).optional(),
      }),
    },
  );
  reg({
    method: 'post',
    path: '/errors',
    tag: 'errors',
    summary: '前端错误上报端点',
    body: z.object({
      type: z.enum(['javascript', 'command']).optional(),
      message: z.string().min(1).max(2048),
      stack: z.string().optional(),
      url: z.string().url().optional(),
      userId: z.string().optional(),
    }),
    errors: [400, 422, 429, 500],
  });
  sec('get', '/feature-flags', 'feature-flags', '查询全部功能开关的当前状态', [401, 500]);
}
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

function registerAuthUserPaths(): void {
  sec('delete', '/auth/logout', 'auth', '登出（吊销刷新令牌）', [400, 401]);
  sec('get', '/auth/me', 'auth', '查询当前用户身份', [401]);
  sec('get', '/auth/orgs', 'auth', '查询可切换组织列表', [401]);
  sec('post', '/auth/switch-org', 'auth', '切换当前组织', [400, 401, 403]);
  sec('delete', '/auth/me', 'auth', '注销账户', [401, 500]);
  reg({
    method: 'post',
    path: '/auth/verify-email',
    tag: 'auth',
    summary: '邮箱验证',
    errors: [400, 404],
  });
  sec('post', '/auth/resend-verification', 'auth', '重发验证邮件', [401, 429]);
}

function registerSaasKeysPaths(): void {
  sec('post', '/keys', 'saas-keys', '创建组织 API Key', [400, 401, 422], {
    body: z.object({ name: z.string().max(120) }),
  });
  sec('get', '/keys', 'saas-keys', '列出组织 API Key', [401]);
  sec('delete', '/keys/{id}', 'saas-keys', '吊销组织 API Key', [401, 404], { params: idParam() });
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
  sec('get', '/orgs/current', 'saas-orgs', '查询当前组织', [401]);
  sec('patch', '/orgs/current', 'saas-orgs', '更新当前组织信息', [401, 403, 422]);
  sec('get', '/orgs/members', 'saas-orgs', '列出组织成员', [401]);
  sec('patch', '/orgs/members/{userId}', 'saas-orgs', '更新成员角色', [401, 403, 404], {
    params: idParam('userId'),
  });
  sec('delete', '/orgs/members/{userId}', 'saas-orgs', '移除成员', [401, 403, 404], {
    params: idParam('userId'),
  });
  sec('get', '/orgs/invitations', 'saas-orgs', '列出组织邀请', [401, 403]);
  sec('post', '/orgs/invitations', 'saas-orgs', '创建组织邀请', [401, 403, 422]);
  sec('post', '/orgs/invitations/accept', 'saas-orgs', '接受组织邀请', [401, 404, 409]);
  sec('delete', '/orgs/invitations/{id}', 'saas-orgs', '撤销组织邀请', [401, 403, 404], {
    params: idParam(),
  });
}

function registerSaasBillingJobsPaths(): void {
  sec('get', '/billing/subscription', 'saas-billing', '查询当前订阅', [401]);
  sec('post', '/billing/checkout', 'saas-billing', '创建 Stripe Checkout Session', [401, 422, 503]);
  sec('post', '/billing/portal', 'saas-billing', '创建 Billing Portal Session', [401, 503]);
  sec('get', '/jobs/{id}', 'saas-jobs', '查询异步任务状态', [401, 403, 404], { params: idParam() });
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

function registerBacktestEndpoints(): void {
  sec('get', '/backtest/search', 'backtest', '搜索可回测标的', [400, 401, 422], {
    query: searchQuerySchema,
  });
  sec('post', '/backtest/portfolio', 'backtest', '组合回测', [400, 401, 422, 500, 503], {
    body: portfolioBacktestSchema,
    accepted: AcceptedEnvelope,
    acceptedDescription: '任务已入队，通过 GET /backtest/runs/:jobId 轮询结果',
  });
  sec('post', '/backtest/portfolio/series', 'backtest', '从缓存补全 Tab 序列', [400, 401, 422], {
    body: portfolioSeriesSchema,
  });
  sec('post', '/backtest/analysis', 'backtest', '资产分析', [400, 401, 422, 500, 503], {
    body: analysisSchema,
  });
  sec('post', '/backtest/monte-carlo', 'backtest', '蒙特卡洛模拟', [400, 401, 422, 500, 503], {
    body: monteCarloSchema,
  });
  sec('post', '/backtest/optimize', 'backtest', '组合优化', [400, 401, 422, 500, 503], {
    body: optimizeSchema,
  });
  sec('post', '/backtest/efficient-frontier', 'backtest', '有效前沿', [400, 401, 422, 500, 503], {
    body: efficientFrontierSchema,
  });
  sec('get', '/backtest/runs/{jobId}', 'backtest', '查询异步回测任务状态', [400, 401, 404, 503], {
    params: idParam('jobId'),
  });
}

function registerTacticalPaths(): void {
  sec(
    'post',
    '/backtest-optimizer/optimize',
    'backtest-optimizer',
    '参数空间网格优化',
    [400, 401, 422, 500, 503],
    { body: backtestOptimizerSchema },
  );
  sec('post', '/tactical/backtest', 'tactical', '战术分配回测', [400, 401, 422, 500, 503], {
    body: tacticalBacktestSchema,
  });
  sec('post', '/tactical/what-if', 'tactical', '战术 What-If 分析', [400, 401, 422, 503], {
    body: tacticalWhatIfSchema,
  });
  sec('post', '/tactical/alerts', 'tactical', '配置战术告警', [400, 401, 422], {
    body: tacticalAlertSchema,
  });
  sec(
    'post',
    '/tactical-grid/search',
    'tactical-grid',
    '战术网格参数搜索',
    [400, 401, 422, 500, 503],
    { body: tacticalGridSearchSchema },
  );
}

function registerSignalPaths(): void {
  sec('post', '/signal/analyze', 'signal', '单信号分析', [400, 401, 422, 500, 503], {
    body: signalAnalyzeSchema,
  });
  sec('post', '/signal/dual', 'signal', '双信号组合分析', [400, 401, 422, 500, 503], {
    body: signalDualSchema,
  });
  sec('post', '/signal/multi', 'signal', '多信号聚合分析', [400, 401, 422, 500, 503], {
    body: signalMultiSchema,
  });
}

function registerAnalysisPaths(): void {
  sec('post', '/pca/analyze', 'pca', 'PCA 主成分分析', [400, 401, 422, 500, 503], {
    body: pcaAnalyzeSchema,
  });
  sec('post', '/letf/analyze', 'letf', '杠杆 ETF 滑点分析', [400, 401, 422, 500, 503], {
    body: letfAnalyzeSchema,
  });
  sec(
    'post',
    '/goal-optimizer/optimize',
    'goal-optimizer',
    '目标优化（蒙特卡洛达成概率）',
    [400, 401, 422, 500, 503],
    { body: goalOptimizerSchema },
  );
  sec('post', '/calculators/{type}', 'calculators', '计算器（按类型）', [400, 401, 422, 503], {
    params: z.object({ type: z.string() }),
  });
  sec(
    'post',
    '/analysis/factor-regression',
    'factor-regression',
    '因子回归分析',
    [400, 401, 422, 503],
  );
}

export function registerBacktestPaths(): void {
  registerBacktestEndpoints();
  registerTacticalPaths();
  registerSignalPaths();
  registerAnalysisPaths();
}

function registerDataEndpoints(): void {
  sec('get', '/data/history', 'data', '获取历史行情数据', [400, 401, 422, 503], {
    query: historyQuerySchema,
  });
  sec('get', '/data/search', 'data', '搜索资产代码', [400, 401, 422], { query: searchQuerySchema });
  sec('get', '/data/cpi/{country}', 'data', '获取 CPI 数据', [400, 401, 404, 503], {
    params: z.object({ country: z.enum(['us', 'cn']) }),
  });
  sec('get', '/data/synthetic', 'data', '获取合成标的列表', [401, 500]);
  sec('get', '/data/meta', 'data', '获取数据元信息', [401, 500]);
  sec('get', '/data/ticker-meta', 'data', '查询单个 ticker 元数据', [400, 401], {
    query: z.object({ ticker: z.string() }),
  });
  sec('get', '/data/recent-updates', 'data', '获取最近更新的标的列表', [401, 500], {
    query: z.object({ limit: z.number().optional() }),
  });
}

function registerDataManageQueryPaths(): void {
  sec('get', '/data/manage/status', 'data-manage', '数据引擎状态', [401, 503]);
  sec('get', '/data/manage/last-updated', 'data-manage', '获取数据最后更新日期', [401, 503]);
  sec('get', '/data/manage/stats', 'data-manage', '数据引擎统计', [401, 503]);
  sec('get', '/data/manage/tickers', 'data-manage', '标的管理列表（分页）', [401, 422], {
    query: tickerListQuerySchema,
  });
  sec('get', '/data/manage/search', 'data-manage', '标的搜索', [401, 422], {
    query: tickerSearchQuerySchema,
  });
  sec('get', '/data/manage/ticker/{id}', 'data-manage', '查询单个标的信息', [400, 401, 404], {
    params: idParam(),
  });
}

function registerDataManageUpdatePaths(): void {
  sec('get', '/data/manage/update/status', 'data-manage', '更新任务状态', [401]);
  sec('put', '/data/manage/update/full', 'data-manage', '触发全量更新', [401, 403, 409, 503]);
  sec('patch', '/data/manage/update/inc', 'data-manage', '触发增量更新', [401, 403, 503]);
  sec('patch', '/data/manage/resume', 'data-manage', '恢复暂停的更新', [401, 403, 409]);
  sec('post', '/data/manage/update/stop', 'data-manage', '停止更新任务', [401, 403, 409]);
  sec('put', '/data/manage/universe', 'data-manage', '更新标的池', [401, 403, 422]);
  sec('put', '/data/manage/regenerate-meta', 'data-manage', '重生成标的元数据', [401, 403, 503]);
}

function registerDataCustomPaths(): void {
  sec('get', '/data/custom', 'data-custom', '列出当前租户的自定义 ticker 数据', [401, 403, 500]);
  sec(
    'post',
    '/data/custom',
    'data-custom',
    '创建集群 ticker 数据',
    [400, 401, 403, 422, 409, 500],
    {
      body: z.object({
        symbol: z.string().min(1).max(50),
        name: z.string().min(1).max(255),
        exchange: z.string().optional(),
        currency: z.string().optional(),
      }),
    },
  );
  sec(
    'delete',
    '/data/custom/{id}',
    'data-custom',
    '删除自定义 ticker 数据',
    [401, 403, 404, 500],
    { params: idParam() },
  );
}

function registerTacticalConfigPaths(): void {
  sec(
    'get',
    '/tactical/configs',
    'tactical-config',
    '列出当前租户的战术分配配置列表',
    [401, 403, 500],
    { query: z.object({ limit: z.number().optional(), offset: z.number().optional() }) },
  );
  sec(
    'get',
    '/tactical/configs/{id}',
    'tactical-config',
    '查询单个战术分配配置的详情',
    [401, 403, 404, 500],
    { params: idParam() },
  );
  sec(
    'post',
    '/tactical/configs',
    'tactical-config',
    '新建战术分配配置',
    [400, 401, 403, 422, 500],
    {
      body: z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        chart: z.string().optional(),
        cs: z.string().optional(),
        longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
        shortSort: z.enum(['rising', 'alpha']).optional(),
      }),
    },
  );
  sec(
    'put',
    '/tactical/configs/{id}',
    'tactical-config',
    '更新战术分配配置',
    [400, 401, 403, 404, 422, 500],
    {
      params: idParam(),
      body: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(255).optional(),
        cs: z.string().optional(),
        longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
        chart: z.string().optional(),
      }),
    },
  );
  sec(
    'delete',
    '/tactical/configs/{id}',
    'tactical-config',
    '删除战术分配配置（软删除）',
    [401, 403, 404, 500],
    { params: idParam() },
  );
}

export function registerDataPaths(): void {
  registerDataEndpoints();
  registerDataManageQueryPaths();
  registerDataManageUpdatePaths();
  registerDataCustomPaths();
  registerTacticalConfigPaths();
}
