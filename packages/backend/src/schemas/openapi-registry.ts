/**
 * OpenAPI 3.0 规范注册中心（P1-05）。
 *
 * 从现有 Zod schema 自动生成 OpenAPI 规范，消除 5410 行手动 YAML 与代码脱节的风险。
 * 本文件是 schema -> OpenAPI 的唯一映射源：
 * - 为通用响应/错误 schema 附加 .openapi() 元数据并注册为命名组件
 * - 注册全部 20 个路由组的端点（路径不带 /api/v1 前缀，由 servers.baseUrl 提供）
 * - 错误响应复用 RFC 7807 ProblemDetails（与 utils/errors.ts sendProblem 对齐）
 *
 * 生成入口：scripts/generate-openapi.ts -> docs/openapi.yaml
 * Swagger UI：packages/backend/src/middleware/openapiUi.ts -> GET /api/docs（仅开发环境）
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { loginSchema, loginPasswordSchema, registerSchema } from './auth.js';
import {
  portfolioBacktestSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
  portfolioSeriesSchema,
} from './backtest.js';
import { historyQuerySchema, searchQuerySchema } from './data.js';
import { tickerListQuerySchema, tickerSearchQuerySchema } from './dataManage.js';
import { backtestOptimizerSchema } from './optimizer.js';
import { signalAnalyzeSchema, signalDualSchema, signalMultiSchema } from './signal.js';
import { tacticalBacktestSchema, tacticalWhatIfSchema, tacticalAlertSchema } from './tactical.js';
import { tacticalGridSearchSchema } from './tacticalGrid.js';
import { pcaAnalyzeSchema, letfAnalyzeSchema, goalOptimizerSchema } from './analysisSchemas.js';
import {
  portfolioBodySchema,
  savedConfigBodySchema,
  backtestRunBodySchema,
} from './persistence.js';

// 必须在使用 .openapi() 之前调用一次，为所有 Zod 对象挂载 openapi 元数据方法。
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// 通用组件：安全方案 / 幂等键 / RFC 7807 错误结构 / 成功信封
// ---------------------------------------------------------------------------

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

// 注册可复用幂等键参数（管理端点 POST 写操作引用）。
registry.registerComponent('parameters', 'IdempotencyKey', {
  name: 'Idempotency-Key',
  in: 'header',
  required: false,
  schema: { type: 'string', maxLength: 128 },
  description: '幂等性 Key，防止管理端点写操作重复执行（1 小时内相同 Key 返回缓存结果）。',
});

/** RFC 7807 Problem Details —— 与 utils/errors.ts sendProblem 输出结构对齐。 */
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

registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: z.unknown(),
  }),
);

const SuccessEnvelope = registry.register(
  'SuccessResponse',
  z.object({
    success: z.literal(true),
    data: z.unknown(),
    degraded: z.boolean().optional(),
    degradedWarning: z.string().optional(),
  }),
);

/** 异步任务受理响应（202 Accepted）—— 与 backtestRoutes.ts 异步路径输出对齐。 */
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

// ---------------------------------------------------------------------------
// 路径注册辅助：压缩重复结构，确保每个 operation 含 summary + responses + 描述
// ---------------------------------------------------------------------------

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RegPathOpts {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  description?: string;
  /** true = JWT BearerAuth；'apiKey' = x-api-key；省略 = 无认证（健康检查/登录）。 */
  security?: true | 'apiKey';
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
  ok?: z.ZodType;
  okDescription?: string;
  /** 202 Accepted 响应 schema（异步端点使用，如回测组合入队）。 */
  accepted?: z.ZodType;
  acceptedDescription?: string;
  /** 错误响应码列表；默认 [400,401,422,500]，健康检查传 []。 */
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
  if (opts.body) {
    request.body = { content: { 'application/json': { schema: opts.body } } };
  }
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

const idParam = (name = 'id') => z.object({ [name]: z.string() });

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// backtest
// ---------------------------------------------------------------------------
reg({
  method: 'get',
  path: '/backtest/search',
  tag: 'backtest',
  summary: '搜索可回测标的',
  security: true,
  query: searchQuerySchema,
  errors: [400, 401, 422],
});
reg({
  method: 'post',
  path: '/backtest/portfolio',
  tag: 'backtest',
  summary: '组合回测',
  security: true,
  body: portfolioBacktestSchema,
  accepted: AcceptedEnvelope,
  acceptedDescription: '任务已入队，通过 GET /backtest/runs/:jobId 轮询结果',
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/backtest/portfolio/series',
  tag: 'backtest',
  summary: '从缓存补全 Tab 序列',
  security: true,
  body: portfolioSeriesSchema,
  errors: [400, 401, 422],
});
reg({
  method: 'post',
  path: '/backtest/analysis',
  tag: 'backtest',
  summary: '资产分析',
  security: true,
  body: analysisSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/backtest/monte-carlo',
  tag: 'backtest',
  summary: '蒙特卡洛模拟',
  security: true,
  body: monteCarloSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/backtest/optimize',
  tag: 'backtest',
  summary: '组合优化',
  security: true,
  body: optimizeSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/backtest/efficient-frontier',
  tag: 'backtest',
  summary: '有效前沿',
  security: true,
  body: efficientFrontierSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'get',
  path: '/backtest/runs/{jobId}',
  tag: 'backtest',
  summary: '查询异步回测任务状态',
  security: true,
  params: idParam('jobId'),
  errors: [400, 401, 404, 503],
});

// ---------------------------------------------------------------------------
// backtest-optimizer
// ---------------------------------------------------------------------------
reg({
  method: 'post',
  path: '/backtest-optimizer/optimize',
  tag: 'backtest-optimizer',
  summary: '参数空间网格优化',
  security: true,
  body: backtestOptimizerSchema,
  errors: [400, 401, 422, 500, 503],
});

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------
reg({
  method: 'get',
  path: '/data/history',
  tag: 'data',
  summary: '获取历史行情数据',
  security: true,
  query: historyQuerySchema,
  errors: [400, 401, 422, 503],
});
reg({
  method: 'get',
  path: '/data/search',
  tag: 'data',
  summary: '搜索资产代码',
  security: true,
  query: searchQuerySchema,
  errors: [400, 401, 422],
});
reg({
  method: 'get',
  path: '/data/cpi/{country}',
  tag: 'data',
  summary: '获取 CPI 数据',
  security: true,
  params: z.object({ country: z.enum(['us', 'cn']) }),
  errors: [400, 401, 404, 503],
});

// ---------------------------------------------------------------------------
// data-manage
// ---------------------------------------------------------------------------
reg({
  method: 'get',
  path: '/data/manage/status',
  tag: 'data-manage',
  summary: '数据引擎状态',
  security: true,
  errors: [401, 503],
});
reg({
  method: 'get',
  path: '/data/manage/stats',
  tag: 'data-manage',
  summary: '数据引擎统计',
  security: true,
  errors: [401, 503],
});
reg({
  method: 'get',
  path: '/data/manage/tickers',
  tag: 'data-manage',
  summary: '标的管理列表（分页）',
  security: true,
  query: tickerListQuerySchema,
  errors: [401, 422],
});
reg({
  method: 'get',
  path: '/data/manage/search',
  tag: 'data-manage',
  summary: '标的搜索',
  security: true,
  query: tickerSearchQuerySchema,
  errors: [401, 422],
});
reg({
  method: 'get',
  path: '/data/manage/update/status',
  tag: 'data-manage',
  summary: '更新任务状态',
  security: true,
  errors: [401],
});
reg({
  method: 'put',
  path: '/data/manage/update/full',
  tag: 'data-manage',
  summary: '触发全量更新',
  security: true,
  errors: [401, 403, 409, 503],
});
reg({
  method: 'patch',
  path: '/data/manage/update/inc',
  tag: 'data-manage',
  summary: '触发增量更新',
  security: true,
  errors: [401, 403, 503],
});
reg({
  method: 'patch',
  path: '/data/manage/resume',
  tag: 'data-manage',
  summary: '恢复暂停的更新',
  security: true,
  errors: [401, 403, 409],
});
reg({
  method: 'post',
  path: '/data/manage/update/stop',
  tag: 'data-manage',
  summary: '停止更新任务',
  security: true,
  errors: [401, 403, 409],
});
reg({
  method: 'put',
  path: '/data/manage/universe',
  tag: 'data-manage',
  summary: '更新标的池',
  security: true,
  errors: [401, 403, 422],
});
reg({
  method: 'get',
  path: '/data/manage/ticker/{id}',
  tag: 'data-manage',
  summary: '查询单个标的信息',
  security: true,
  params: idParam(),
  errors: [400, 401, 404],
});
reg({
  method: 'put',
  path: '/data/manage/regenerate-meta',
  tag: 'data-manage',
  summary: '重生成标的元数据',
  security: true,
  errors: [401, 403, 503],
});

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------
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

// admin/keys（平台 break-glass 密钥轮换）
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

// ---------------------------------------------------------------------------
// saas-keys（按组织 API Key，ADR-033）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// saas-portfolios（租户组合持久化，ADR-034）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// saas-configs（命名配置持久化，ADR-034）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// saas-runs（回测历史持久化，ADR-034）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// saas-orgs（组织与成员，ADR-035）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// saas-billing（Stripe 计费，ADR-036）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// saas-jobs（异步任务，ADR-019）
// ---------------------------------------------------------------------------
reg({
  method: 'get',
  path: '/jobs/{id}',
  tag: 'saas-jobs',
  summary: '查询异步任务状态',
  security: true,
  params: idParam(),
  errors: [401, 403, 404],
});

// ---------------------------------------------------------------------------
// tactical / tactical-grid
// ---------------------------------------------------------------------------
reg({
  method: 'post',
  path: '/tactical/backtest',
  tag: 'tactical',
  summary: '战术分配回测',
  security: true,
  body: tacticalBacktestSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/tactical/what-if',
  tag: 'tactical',
  summary: '战术 What-If 分析',
  security: true,
  body: tacticalWhatIfSchema,
  errors: [400, 401, 422, 503],
});
reg({
  method: 'post',
  path: '/tactical/alerts',
  tag: 'tactical',
  summary: '配置战术告警',
  security: true,
  body: tacticalAlertSchema,
  errors: [400, 401, 422],
});
reg({
  method: 'post',
  path: '/tactical-grid/search',
  tag: 'tactical-grid',
  summary: '战术网格参数搜索',
  security: true,
  body: tacticalGridSearchSchema,
  errors: [400, 401, 422, 500, 503],
});

// ---------------------------------------------------------------------------
// signal
// ---------------------------------------------------------------------------
reg({
  method: 'post',
  path: '/signal/analyze',
  tag: 'signal',
  summary: '单信号分析',
  security: true,
  body: signalAnalyzeSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/signal/dual',
  tag: 'signal',
  summary: '双信号组合分析',
  security: true,
  body: signalDualSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/signal/multi',
  tag: 'signal',
  summary: '多信号聚合分析',
  security: true,
  body: signalMultiSchema,
  errors: [400, 401, 422, 500, 503],
});

// ---------------------------------------------------------------------------
// analysis（pca / letf / goal-optimizer / calculators / factor-regression，ADR-042）
// ---------------------------------------------------------------------------
reg({
  method: 'post',
  path: '/pca/analyze',
  tag: 'pca',
  summary: 'PCA 主成分分析',
  security: true,
  body: pcaAnalyzeSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/letf/analyze',
  tag: 'letf',
  summary: '杠杆 ETF 滑点分析',
  security: true,
  body: letfAnalyzeSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/goal-optimizer/optimize',
  tag: 'goal-optimizer',
  summary: '目标优化（蒙特卡洛达成概率）',
  security: true,
  body: goalOptimizerSchema,
  errors: [400, 401, 422, 500, 503],
});
reg({
  method: 'post',
  path: '/calculators/{type}',
  tag: 'calculators',
  summary: '计算器（按类型）',
  security: true,
  params: z.object({ type: z.string() }),
  errors: [400, 401, 422, 503],
});
reg({
  method: 'post',
  path: '/analysis/factor-regression',
  tag: 'factor-regression',
  summary: '因子回归分析',
  security: true,
  errors: [400, 401, 422, 503],
});

// ---------------------------------------------------------------------------
// health（无需认证，错误响应豁免）
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 文档生成
// ---------------------------------------------------------------------------

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
];

/**
 * 生成完整 OpenAPI 3.0 文档对象。
 *
 * @returns OpenAPI 3.0.3 文档（可直接 JSON.stringify 或交由 yaml 序列化）。
 */
export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '回测平台 API',
      version: '1.0.0',
      description:
        '回测平台提供组合回测、资产分析、蒙特卡洛模拟、组合优化、有效前沿、战术分配、信号分析、PCA、LETF、目标优化等量化投资工具。\n\n## 认证\n- 计算端点必须携带 JWT Bearer Token（Authorization: Bearer <accessToken>）\n- 管理端点需 JWT + RBAC 权限\n- 兼容模式：x-api-key 请求头（过渡用，不推荐生产长期依赖）\n- 认证流程：POST /auth/login/password -> accessToken + refreshToken\n- 健康检查 /health 与 /metrics 无需用户 JWT\n\n## 速率限制\n- 普通 API：100 次/15 分钟/IP\n- 计算密集型 API（backtest、backtest-optimizer）：10 次/分钟/IP\n\n## 错误格式\n- 所有错误使用 RFC 7807 Problem Details：{ success: false, error: { type, title, status, code, detail } }\n- 降级响应包含 degraded: true + degradedWarning',
    },
    servers: [{ url: 'http://localhost:5001/api/v1', description: '本地开发环境' }],
    tags: TAGS.map((name) => ({ name })),
    security: [{ BearerAuth: [] }],
  });
}
