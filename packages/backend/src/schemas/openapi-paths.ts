/* eslint-disable max-params, max-lines-per-function -- 声明式 OpenAPI 路径注册表：helper 多参使 ~100 个调用点保持可读 */
import { z } from 'zod';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import {
  loginPasswordSchema,
  registerSchema,
  tacticalBacktestSchema,
  tacticalWhatIfSchema,
  tacticalGridSearchSchema,
} from './tactical.js';
import {
  portfolioBodySchema,
  savedConfigBodySchema,
  backtestRunBodySchema,
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
  portfolioSeriesSchema,
  backtestOptimizerSchema,
  anyJsonSchema,
} from './backtest.js';
import {
  searchQuerySchema,
  tickerListQuerySchema,
  tickerSearchQuerySchema,
  signalAnalyzeSchema,
  signalDualSchema,
  signalMultiSchema,
  pcaAnalyzeSchema,
  letfAnalyzeSchema,
  goalOptimizerSchema,
} from './analysisSchemas.js';

extendZodWithOpenApi(z);
const registry = new OpenAPIRegistry();
registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'JWT 访问令牌，通过 /auth/login 获取。',
});
registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'x-api-key',
  description: '按组织 API Key（过渡兼容，不推荐生产长期依赖）。',
});
registry.registerComponent('parameters', 'IdempotencyKey', {
  name: 'Idempotency-Key',
  in: 'header',
  required: false,
  schema: { type: 'string', maxLength: 128 },
  description: '幂等性 Key，防止管理端点写操作重复执行（1 小时内相同 Key 返回缓存结果）。',
});
const ProblemDetail = registry.register(
  'ProblemDetail',
  z.object({
    success: z.literal(false),
    error: z.object({
      type: z.string().url(),
      title: z.string(),
      status: z.number().int(),
      code: z.string(),
      detail: z.string().optional(),
      instance: z.string().optional(),
    }),
    degraded: z.boolean().optional(),
    degradedWarning: z.string().optional(),
  }),
);
registry.register('ErrorResponse', z.object({ success: z.literal(false), error: anyJsonSchema }));
const SuccessEnvelope = registry.register(
  'SuccessResponse',
  z.object({
    success: z.literal(true),
    data: anyJsonSchema,
    degraded: z.boolean().optional(),
    degradedWarning: z.string().optional(),
  }),
);
const AcceptedEnvelope = registry.register(
  'BacktestJobAccepted',
  z.object({
    success: z.literal(true),
    data: z.object({
      jobId: z.string().uuid(),
      status: z.literal('queued'),
      statusUrl: z.string(),
    }),
  }),
);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface RegPathOpts {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  description?: string;
  security?: true | 'apiKey';
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
  ok?: z.ZodType;
  okDescription?: string;
  accepted?: z.ZodType;
  acceptedDescription?: string;
  errors?: number[];
}
const DEFAULT_ERRORS = [400, 401, 422, 500];
const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: '请求参数错误',
  401: '未认证或令牌失效',
  403: '无权限',
  404: '资源不存在',
  409: '冲突',
  422: '校验失败',
  429: '请求过于频繁',
  500: '服务器内部错误',
  503: '服务不可用（降级或引擎不可用）',
};
function buildResponses(opts: RegPathOpts) {
  const responses: Record<
    string,
    { description: string; content: Record<string, { schema: z.ZodType }> }
  > = {};
  if (opts.accepted) {
    responses[202] = {
      description: opts.acceptedDescription ?? '任务已受理，轮询 /runs/:jobId 获取状态',
      content: { 'application/json': { schema: opts.accepted } },
    };
  }
  responses[200] = {
    description: opts.okDescription ?? '成功',
    content: { 'application/json': { schema: opts.ok ?? SuccessEnvelope } },
  };
  for (const code of opts.errors ?? DEFAULT_ERRORS) {
    responses[code] = {
      description: ERROR_DESCRIPTIONS[code] ?? '错误',
      content: { 'application/problem+json': { schema: ProblemDetail } },
    };
  }
  return responses;
}
function reg(opts: RegPathOpts): void {
  const request: Record<string, unknown> = {};
  if (opts.params) request.params = opts.params;
  if (opts.query) request.query = opts.query;
  if (opts.body) request.body = { content: { 'application/json': { schema: opts.body } } };
  const security =
    opts.security === true
      ? [{ BearerAuth: [] }]
      : opts.security === 'apiKey'
        ? [{ ApiKeyAuth: [] }]
        : undefined;
  registry.registerPath({
    method: opts.method,
    path: opts.path,
    summary: opts.summary,
    tags: [opts.tag],
    ...(opts.description ? { description: opts.description } : {}),
    ...(security ? { security } : {}),
    ...(Object.keys(request).length ? { request } : {}),
    responses: buildResponses(opts),
  });
}
function idParam(name = 'id') {
  return z.object({ [name]: z.string() });
}

const AUTH_ERR = [401, 403, 500];
const AUTH_500_ERR = [401, 500];
const PERM_ERR = [401, 403];
const ID_ERR = [401, 403, 404];
const NOT_FOUND_ERR = [401, 404];
const AUTH_NOT_FOUND_ERR = [401, 403, 404, 500];
const VALIDATION_ERR = [400, 401, 403, 422, 500];
const UPDATE_ERR = [400, 401, 403, 404, 422, 500];
const BACKTEST_ERR = [400, 401, 422, 500, 503];
const TACTICAL_ERR = [400, 401, 422, 503];
const STATUS_ERR = [401, 503];
const WITH_ID_PARAM = { params: idParam() } as const;
const WITH_USER_ID_PARAM = { params: idParam('userId') } as const;
const PAGINATION_QUERY = z.object({ limit: z.number().optional(), offset: z.number().optional() });
const KEY_BODY = z.object({ name: z.string().max(120) });

function sec(
  method: Method,
  path: string,
  tag: string,
  summary: string,
  errors: number[],
  extra: Partial<
    Omit<RegPathOpts, 'method' | 'path' | 'tag' | 'summary' | 'errors' | 'security'>
  > = {},
): void {
  reg({ method, path, tag, summary, errors, security: true, ...extra });
}
function pubReg(
  method: Method,
  path: string,
  tag: string,
  summary: string,
  errors: number[],
  okDescription?: string,
  body?: z.ZodType,
): void {
  reg({ method, path, tag, summary, errors, body, okDescription });
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
  sec('get', `${opts.basePath}/{id}`, opts.tag, opts.getSummary, NOT_FOUND_ERR, WITH_ID_PARAM);
  if (opts.createBody)
    sec('post', opts.basePath, opts.tag, opts.createSummary!, [400, 401, 422], {
      body: opts.createBody,
    });
  if (opts.updateBody)
    sec('put', `${opts.basePath}/{id}`, opts.tag, opts.updateSummary!, [400, 401, 404, 422], {
      ...WITH_ID_PARAM,
      body: opts.updateBody,
    });
  sec('delete', `${opts.basePath}/{id}`, opts.tag, opts.deleteSummary, NOT_FOUND_ERR, {
    ...WITH_ID_PARAM,
  });
}

function registerAllPaths(): void {
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
  sec('delete', '/auth/logout', 'auth', '登出（吊销刷新令牌）', [400, 401]);
  sec('get', '/auth/me', 'auth', '查询当前用户身份', [401]);
  sec('get', '/auth/orgs', 'auth', '查询可切换组织列表', [401]);
  sec('post', '/auth/switch-org', 'auth', '切换当前组织', [400, 401, 403]);
  sec('delete', '/auth/me', 'auth', '注销账户', AUTH_500_ERR);
  pubReg('post', '/auth/verify-email', 'auth', '邮箱验证', [400, 404]);
  sec('post', '/auth/resend-verification', 'auth', '重发验证邮件', [401, 429]);
  sec('post', '/keys', 'saas-keys', '创建组织 API Key', [400, 401, 422], { body: KEY_BODY });
  sec('get', '/keys', 'saas-keys', '列出组织 API Key', [401]);
  sec('delete', '/keys/{id}', 'saas-keys', '吊销组织 API Key', NOT_FOUND_ERR, WITH_ID_PARAM);
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
  registerCrud({
    tag: 'saas-runs',
    basePath: '/runs',
    listSummary: '列出回测历史',
    getSummary: '查询回测历史详情',
    createSummary: '保存回测历史',
    createBody: backtestRunBodySchema,
    deleteSummary: '删除回测历史',
  });
  sec('get', '/orgs/members', 'saas-orgs', '列出组织成员', [401]);
  sec('patch', '/orgs/members/{userId}', 'saas-orgs', '更新成员角色', ID_ERR, WITH_USER_ID_PARAM);
  sec('delete', '/orgs/members/{userId}', 'saas-orgs', '移除成员', ID_ERR, WITH_USER_ID_PARAM);
  sec('get', '/orgs/invitations', 'saas-orgs', '列出组织邀请', PERM_ERR);
  sec('post', '/orgs/invitations', 'saas-orgs', '创建组织邀请', [401, 403, 422]);
  sec('post', '/orgs/invitations/accept', 'saas-orgs', '接受组织邀请', [401, 404, 409]);
  sec('delete', '/orgs/invitations/{id}', 'saas-orgs', '撤销组织邀请', ID_ERR, WITH_ID_PARAM);
  sec('get', '/billing/subscription', 'saas-billing', '查询当前订阅', [401]);
  sec('post', '/billing/checkout', 'saas-billing', '创建 Stripe Checkout Session', [401, 422, 503]);
  sec('post', '/billing/portal', 'saas-billing', '创建 Billing Portal Session', [401, 503]);
  sec('get', '/jobs/{id}', 'saas-jobs', '查询异步任务状态', ID_ERR, WITH_ID_PARAM);
  sec('get', '/admin/stats', 'admin', '仪表盘统计', PERM_ERR);
  sec('get', '/admin/system', 'admin', '系统资源信息', PERM_ERR);
  sec('post', '/admin/keys/rotate', 'admin', '轮换 ADMIN_API_KEY', AUTH_ERR);
  sec('delete', '/admin/keys/{id}', 'admin', '吊销指定密钥', ID_ERR, WITH_ID_PARAM);
  sec('get', '/admin/keys', 'admin', '列出平台密钥', PERM_ERR);
  pubReg('get', '/health', 'health', '存活探针', [503], '服务存活');
  pubReg('get', '/ready', 'health', '就绪探针', [503], '服务就绪');
  pubReg('get', '/metrics', 'health', 'Prometheus 指标', [], 'Prometheus 文本格式指标');
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
  sec('get', '/backtest/search', 'backtest', '搜索可回测标的', [400, 401, 422], {
    query: searchQuerySchema,
  });
  sec('post', '/backtest/portfolio', 'backtest', '组合回测', BACKTEST_ERR, {
    body: portfolioBacktestSchema,
    accepted: AcceptedEnvelope,
    acceptedDescription: '任务已入队，通过 GET /backtest/runs/:jobId 轮询结果',
  });
  sec('post', '/backtest/portfolio/series', 'backtest', '从缓存补全 Tab 序列', [400, 401, 422], {
    body: portfolioSeriesSchema,
  });
  sec('post', '/backtest/analysis', 'backtest', '资产分析', BACKTEST_ERR, { body: analysisSchema });
  sec('post', '/backtest/monte-carlo', 'backtest', '蒙特卡洛模拟', BACKTEST_ERR, {
    body: monteCarloSchema,
  });
  sec('post', '/backtest/optimize', 'backtest', '组合优化', BACKTEST_ERR, { body: optimizeSchema });
  sec('post', '/backtest/efficient-frontier', 'backtest', '有效前沿', BACKTEST_ERR, {
    body: efficientFrontierSchema,
  });
  sec('get', '/backtest/runs/{jobId}', 'backtest', '查询异步回测任务状态', [400, 401, 404, 503], {
    params: idParam('jobId'),
  });
  sec(
    'post',
    '/backtest-optimizer/optimize',
    'backtest-optimizer',
    '参数空间网格优化',
    BACKTEST_ERR,
    { body: backtestOptimizerSchema },
  );
  sec('post', '/tactical/backtest', 'tactical', '战术分配回测', BACKTEST_ERR, {
    body: tacticalBacktestSchema,
  });
  sec('post', '/tactical/what-if', 'tactical', '战术 What-If 分析', TACTICAL_ERR, {
    body: tacticalWhatIfSchema,
  });
  sec('post', '/tactical-grid/search', 'tactical-grid', '战术网格参数搜索', BACKTEST_ERR, {
    body: tacticalGridSearchSchema,
  });
  sec('post', '/signal/analyze', 'signal', '单信号分析', BACKTEST_ERR, {
    body: signalAnalyzeSchema,
  });
  sec('post', '/signal/dual', 'signal', '双信号组合分析', BACKTEST_ERR, { body: signalDualSchema });
  sec('post', '/signal/multi', 'signal', '多信号聚合分析', BACKTEST_ERR, {
    body: signalMultiSchema,
  });
  sec('post', '/pca/analyze', 'pca', 'PCA 主成分分析', BACKTEST_ERR, { body: pcaAnalyzeSchema });
  sec('post', '/letf/analyze', 'letf', '杠杆 ETF 滑点分析', BACKTEST_ERR, {
    body: letfAnalyzeSchema,
  });
  sec(
    'post',
    '/goal-optimizer/optimize',
    'goal-optimizer',
    '目标优化（蒙特卡洛达成概率）',
    BACKTEST_ERR,
    { body: goalOptimizerSchema },
  );
  sec('post', '/calculators/{type}', 'calculators', '计算器（按类型）', TACTICAL_ERR, {
    params: z.object({ type: z.string() }),
  });
  sec('post', '/analysis/factor-regression', 'factor-regression', '因子回归分析', TACTICAL_ERR);
  sec('get', '/data/cpi/{country}', 'data', '获取 CPI 数据', [400, 401, 404, 503], {
    params: z.object({ country: z.enum(['us', 'cn']) }),
  });
  sec('get', '/data/meta', 'data', '获取数据元信息', AUTH_500_ERR);
  sec('get', '/data/ticker-meta', 'data', '查询单个 ticker 元数据', [400, 401], {
    query: z.object({ ticker: z.string() }),
  });
  sec('get', '/data/recent-updates', 'data', '获取最近更新的标的列表', AUTH_500_ERR, {
    query: z.object({ limit: z.number().optional() }),
  });
  sec('get', '/data/manage/status', 'data-manage', '数据引擎状态', STATUS_ERR);
  sec('get', '/data/manage/last-updated', 'data-manage', '获取数据最后更新日期', STATUS_ERR);
  sec('get', '/data/manage/stats', 'data-manage', '数据引擎统计', STATUS_ERR);
  sec('get', '/data/manage/tickers', 'data-manage', '标的管理列表（分页）', [401, 422], {
    query: tickerListQuerySchema,
  });
  sec('get', '/data/manage/search', 'data-manage', '标的搜索', [401, 422], {
    query: tickerSearchQuerySchema,
  });
  sec('get', '/data/manage/ticker/{id}', 'data-manage', '查询单个标的信息', [400, 401, 404], {
    ...WITH_ID_PARAM,
  });
  sec('get', '/data/manage/update/status', 'data-manage', '更新任务状态', [401]);
  sec('put', '/data/manage/update/full', 'data-manage', '触发全量更新', [401, 403, 409, 503]);
  sec('patch', '/data/manage/update/inc', 'data-manage', '触发增量更新', [401, 403, 503]);
  sec('post', '/data/manage/update/stop', 'data-manage', '停止更新任务', [401, 403, 409]);
  sec('put', '/data/manage/universe', 'data-manage', '更新标的池', [401, 403, 422]);
  sec('put', '/data/manage/regenerate-meta', 'data-manage', '重生成标的元数据', [401, 403, 503]);
  sec('get', '/tactical/configs', 'tactical-config', '列出当前租户的战术分配配置列表', AUTH_ERR, {
    query: PAGINATION_QUERY,
  });
  sec(
    'get',
    '/tactical/configs/{id}',
    'tactical-config',
    '查询单个战术分配配置的详情',
    AUTH_NOT_FOUND_ERR,
    WITH_ID_PARAM,
  );
  sec('post', '/tactical/configs', 'tactical-config', '新建战术分配配置', VALIDATION_ERR, {
    body: z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      chart: z.string().optional(),
      cs: z.string().optional(),
      longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
      shortSort: z.enum(['rising', 'alpha']).optional(),
    }),
  });
  sec('put', '/tactical/configs/{id}', 'tactical-config', '更新战术分配配置', UPDATE_ERR, {
    ...WITH_ID_PARAM,
    body: z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(255).optional(),
      cs: z.string().optional(),
      longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
      chart: z.string().optional(),
    }),
  });
  sec(
    'delete',
    '/tactical/configs/{id}',
    'tactical-config',
    '删除战术分配配置（软删除）',
    AUTH_NOT_FOUND_ERR,
    WITH_ID_PARAM,
  );
}

const TAGS = [
  'auth',
  'backtest',
  'backtest-optimizer',
  'data',
  'data-manage',
  'admin',
  'saas-keys',
  'saas-portfolios',
  'saas-configs',
  'saas-runs',
  'saas-orgs',
  'saas-billing',
  'saas-jobs',
  'tactical',
  'tactical-grid',
  'signal',
  'pca',
  'letf',
  'goal-optimizer',
  'calculators',
  'factor-regression',
  'health',
  'webhooks',
  'announcements',
  'tactical-config',
  'data-custom',
  'audit-logs',
  'rbac',
  'errors',
  'feature-flags',
];

export function generateOpenApiDocument() {
  registerAllPaths();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '回测平台 API',
      version: '1.0.0',
      description:
        '回测平台提供组合回测、资产分析、蒙特卡洛模拟、组合优化、有效前沿、战术分配、信号分析、PCA、LETF、目标优化等量化投资工具。\n\n## 认证\n- 计算端点必须携带 JWT Bearer Token（Authorization: Bearer <accessToken>）\n- 管理端点需 JWT + RBAC 权限\n- 兼容模式：x-api-key 请求头（过渡用，不推荐生产长期依赖）\n- 认证流程：POST /auth/login/password -> accessToken + refreshToken\n- 健康检查 /health 与 /metrics 无需用户 JWT\n\n## 速率限制\n- 普通 API：100 次/15 分钟/IP\n- 计算密集型 API（backtest、backtest-optimizer）：10 次/分钟/IP\n\n## 错误格式\n- 所有错误使用 RFC 7807 Problem Details：{ success: false, error: { type, title, status, code, detail } }\n- 数据服务降级响应包含 degraded: true + degradedWarning（仅数据端点；引擎端点 fail-closed 返回 503 + Retry-After，见 ADR-031）',
    },
    servers: [{ url: 'http://localhost:15001/api/v1', description: '本地开发环境' }],
    tags: TAGS.map((name) => ({ name })),
    security: [{ BearerAuth: [] }],
  });
}
