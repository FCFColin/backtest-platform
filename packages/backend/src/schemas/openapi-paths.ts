/* eslint-disable max-params -- 声明式路径注册统一走 6 参 reg() */
import { z } from 'zod';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { loginPasswordSchema as loginPwd, registerSchema as regB } from './auth.js';
import { createAnnouncementSchema as mkAnn, errorReportSchema as errRep } from './platform.js';
import { tacticalBacktestSchema as tacBt, tacticalWhatIfSchema as tacWi } from './tactical.js';
import { tacticalGridSearchSchema as tacGrid } from './tactical.js';
import { portfolioBodySchema as pfBody, savedConfigBodySchema as cfgBody } from './backtest.js';
import { backtestRunBodySchema as runBody, analysisSchema as anls } from './backtest.js';
import { monteCarloSchema as mc, efficientFrontierSchema as ef } from './backtest.js';
import { portfolioBacktestSchema as pfBt, optimizeSchema as optz } from './backtest.js';
import { portfolioSeriesSchema as pfSer, backtestOptimizerSchema as btOpt } from './backtest.js';
import { anyJsonSchema as anyJ } from './backtest.js';
import { tickerListQuerySchema as tkLq, signalDualSchema as sigD } from './analysisSchemas.js';
import { tickerSearchQuerySchema as tkSq, signalMultiSchema as sigM } from './analysisSchemas.js';
import { letfAnalyzeSchema as letfA, goalOptimizerSchema as goalO } from './analysisSchemas.js';
import { pcaAnalyzeSchema as pcaA, factorRegressionSchema as facReg } from './analysisSchemas.js';
import { signalAnalyzeSchema as sigA, calculatorBodySchema as calcB } from './analysisSchemas.js';

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

const DEGRADED = { degraded: z.boolean().optional(), degradedWarning: z.string().optional() };
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
    ...DEGRADED,
  }),
);
registry.register('ErrorResponse', z.object({ success: z.literal(false), error: anyJ }));
const SuccessEnvelope = registry.register(
  'SuccessResponse',
  z.object({
    success: z.literal(true),
    data: anyJ,
    ...DEGRADED,
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
interface Extra {
  b?: z.ZodType;
  q?: z.ZodType;
  p?: z.ZodType;
  d?: string;
  a?: z.ZodType;
  ad?: string;
  pub?: 1;
}
type Row = [Method, string, string, string, number[], Extra?];
interface Resp {
  description: string;
  content: Record<string, { schema: z.ZodType }>;
}
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

function buildResponses(errs: number[], x: Extra): Record<string, Resp> {
  const out: Record<string, Resp> = {};
  if (x.a)
    out[202] = {
      description: x.ad ?? '任务已受理，轮询 /runs/:jobId 获取状态',
      content: { 'application/json': { schema: x.a } },
    };
  out[200] = {
    description: x.d ?? '成功',
    content: { 'application/json': { schema: SuccessEnvelope } },
  };
  for (const code of errs)
    out[code] = {
      description: ERROR_DESCRIPTIONS[code] ?? '错误',
      content: { 'application/problem+json': { schema: ProblemDetail } },
    };
  return out;
}

function reg(m: Method, p: string, tag: string, sum: string, errs: number[], x: Extra = {}): void {
  const request: Record<string, unknown> = {};
  if (x.p) request.params = x.p;
  if (x.q) request.query = x.q;
  if (x.b) request.body = { content: { 'application/json': { schema: x.b } } };
  registry.registerPath({
    method: m,
    path: p,
    summary: sum,
    tags: [tag],
    security: x.pub ? [] : [{ BearerAuth: [] }],
    ...(Object.keys(request).length ? { request } : {}),
    responses: buildResponses(errs, x),
  });
}

const AUTH_ERR = [401, 403, 500];
const AUTH_500 = [401, 500];
const PERM_ERR = [401, 403];
const ID_ERR = [401, 403, 404];
const NF_ERR = [401, 404];
const ANF_ERR = [401, 403, 404, 500];
const VAL_ERR = [400, 401, 403, 422, 500];
const UPD_ERR = [400, 401, 403, 404, 422, 500];
const PUT_ERR = [400, 401, 404, 422];
const BT_ERR = [400, 401, 422, 500, 503];
const TAC_ERR = [400, 401, 422, 503];
const STATUS_ERR = [401, 503];
const GOAL_PATH = '/goal-optimizer/optimize';
const CFG_ID = '/tactical/configs/{id}';
const ID_P = { p: z.object({ id: z.string().uuid() }) };
const USER_P = { p: z.object({ userId: z.string().uuid() }) };
const CPI_P = { p: z.object({ country: z.enum(['us', 'cn']) }) };
const TYPE_P = { p: z.object({ type: z.string() }) };
const PAGE_Q = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const KEY_BODY = z.object({ name: z.string().max(120) });
const SEARCH_Q = z.object({
  query: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
const TK_Q = z.object({ ticker: z.string() });
const LIM_Q = z.object({ limit: z.number().optional() });
const TAC_CFG = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  chart: z.string().optional(),
  cs: z.string().optional(),
  longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
  shortSort: z.enum(['rising', 'alpha']).optional(),
});
const TAC_CFG_UPD = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(255).optional(),
  cs: z.string().optional(),
  longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
  chart: z.string().optional(),
});
const TAGS = `auth backtest backtest-optimizer data data-manage admin saas-keys saas-portfolios
saas-configs saas-runs saas-orgs saas-billing saas-jobs tactical tactical-grid signal pca letf
goal-optimizer calculators factor-regression health announcements tactical-config errors`.split(
  /\s+/,
);

// 行格式：[method, path, tag, summary, errors, extras?]；extras: b=body q=query p=params
// d=ok 描述 a=202 schema ad=202 描述 pub=公开端点。仅超宽行走 registerSpecialPaths。
const ROWS: Row[] = [
  ['post', '/auth/register', 'auth', '注册新用户', [400, 409, 422, 429, 500], { pub: 1, b: regB }],
  ['post', '/auth/refresh', 'auth', '刷新访问令牌', [400, 401, 500], { pub: 1 }],
  ['post', '/auth/verify-email', 'auth', '邮箱验证', [400, 404], { pub: 1 }],
  ['get', '/health', 'health', '存活探针', [503], { pub: 1, d: '服务存活' }],
  ['get', '/ready', 'health', '就绪探针', [503], { pub: 1, d: '服务就绪' }],
  ['get', '/metrics', 'health', 'Prometheus 指标', [], { pub: 1, d: 'Prometheus 文本格式指标' }],
  ['post', '/errors', 'errors', '前端错误上报端点', [400, 422, 429, 500], { pub: 1, b: errRep }],
  ['delete', '/auth/logout', 'auth', '登出（吊销刷新令牌）', [400, 401]],
  ['get', '/auth/me', 'auth', '查询当前用户身份', [401]],
  ['get', '/auth/orgs', 'auth', '查询可切换组织列表', [401]],
  ['post', '/auth/switch-org', 'auth', '切换当前组织', [400, 401, 403]],
  ['delete', '/auth/me', 'auth', '注销账户', AUTH_500],
  ['get', '/keys', 'saas-keys', '列出组织 API Key', [401]],
  ['delete', '/keys/{id}', 'saas-keys', '吊销组织 API Key', NF_ERR],
  ['get', '/orgs/members', 'saas-orgs', '列出组织成员', [401]],
  ['get', '/orgs/invitations', 'saas-orgs', '列出组织邀请', PERM_ERR],
  ['post', '/orgs/invitations', 'saas-orgs', '创建组织邀请', [401, 403, 422]],
  ['post', '/orgs/invitations/accept', 'saas-orgs', '接受组织邀请', [401, 404, 409]],
  ['delete', '/orgs/invitations/{id}', 'saas-orgs', '撤销组织邀请', ID_ERR],
  ['get', '/billing/subscription', 'saas-billing', '查询当前订阅', [401]],
  ['post', '/billing/checkout', 'saas-billing', '创建 Stripe Checkout Session', [401, 422, 503]],
  ['post', '/billing/portal', 'saas-billing', '创建 Billing Portal Session', [401, 503]],
  ['get', '/jobs/{id}', 'saas-jobs', '查询异步任务状态', ID_ERR],
  ['get', '/admin/stats', 'admin', '仪表盘统计', PERM_ERR],
  ['get', '/admin/system', 'admin', '系统资源信息', PERM_ERR],
  ['post', '/admin/keys/rotate', 'admin', '轮换 ADMIN_API_KEY', AUTH_ERR],
  ['delete', '/admin/keys/{id}', 'admin', '吊销指定密钥', ID_ERR],
  ['get', '/admin/keys', 'admin', '列出平台密钥', PERM_ERR],
  ['get', '/data/health', 'data', '数据服务健康状态', [401, 503]],
  ['get', '/data/factors', 'data', 'Fama-French 因子数据', [401, 503]],
  ['get', '/data/meta', 'data', '获取数据元信息', AUTH_500],
  ['get', '/data/manage/status', 'data-manage', '数据引擎状态', STATUS_ERR],
  ['get', '/data/manage/last-updated', 'data-manage', '获取数据最后更新日期', STATUS_ERR],
  ['get', '/data/manage/stats', 'data-manage', '数据引擎统计', STATUS_ERR],
  ['get', '/data/manage/update/status', 'data-manage', '更新任务状态', [401]],
  ['put', '/data/manage/update/full', 'data-manage', '触发全量更新', [401, 403, 409, 503]],
  ['patch', '/data/manage/update/inc', 'data-manage', '触发增量更新', [401, 403, 503]],
  ['post', '/data/manage/update/stop', 'data-manage', '停止更新任务', [401, 403, 409]],
  ['put', '/data/manage/universe', 'data-manage', '更新标的池', [401, 403, 422]],
  ['post', '/keys', 'saas-keys', '创建组织 API Key', [400, 401, 422], { b: KEY_BODY }],
  ['patch', '/orgs/members/{userId}', 'saas-orgs', '更新成员角色', ID_ERR, USER_P],
  ['delete', '/orgs/members/{userId}', 'saas-orgs', '移除成员', ID_ERR, USER_P],
  ['get', '/backtest/search', 'backtest', '搜索可回测标的', [400, 401, 422], { q: SEARCH_Q }],
  ['post', '/backtest/analysis', 'backtest', '资产分析', BT_ERR, { b: anls }],
  ['post', '/backtest/monte-carlo', 'backtest', '蒙特卡洛模拟', BT_ERR, { b: mc }],
  ['post', '/backtest/optimize', 'backtest', '组合优化', BT_ERR, { b: optz }],
  ['post', '/backtest/efficient-frontier', 'backtest', '有效前沿', BT_ERR, { b: ef }],
  ['post', '/tactical/backtest', 'tactical', '战术分配回测', BT_ERR, { b: tacBt }],
  ['post', '/tactical/what-if', 'tactical', '战术 What-If 分析', TAC_ERR, { b: tacWi }],
  ['post', '/tactical-grid/search', 'tactical-grid', '战术网格参数搜索', BT_ERR, { b: tacGrid }],
  ['post', '/signal/analyze', 'signal', '单信号分析', BT_ERR, { b: sigA }],
  ['post', '/signal/dual', 'signal', '双信号组合分析', BT_ERR, { b: sigD }],
  ['post', '/signal/multi', 'signal', '多信号聚合分析', BT_ERR, { b: sigM }],
  ['post', '/pca/analyze', 'pca', 'PCA 主成分分析', BT_ERR, { b: pcaA }],
  ['post', '/letf/analyze', 'letf', '杠杆 ETF 滑点分析', BT_ERR, { b: letfA }],
  ['get', '/data/cpi/{country}', 'data', '获取 CPI 数据', [400, 401, 404, 503], CPI_P],
  ['get', '/data/ticker-meta', 'data', '查询单个 ticker 元数据', [400, 401], { q: TK_Q }],
  ['get', '/data/recent-updates', 'data', '获取最近更新的标的列表', AUTH_500, { q: LIM_Q }],
  ['get', '/data/manage/tickers', 'data-manage', '标的管理列表（分页）', [401, 422], { q: tkLq }],
  ['get', '/data/manage/search', 'data-manage', '标的搜索', [401, 422], { q: tkSq }],
  ['get', '/data/manage/ticker/{id}', 'data-manage', '查询单个标的信息', [400, 401, 404], ID_P],
  ['post', '/announcements', 'announcements', '发布公告（仅管理员）', VAL_ERR, { b: mkAnn }],
  ['get', CFG_ID, 'tactical-config', '查询单个战术分配配置的详情', ANF_ERR, ID_P],
  ['post', '/tactical/configs', 'tactical-config', '新建战术分配配置', VAL_ERR, { b: TAC_CFG }],
  ['put', CFG_ID, 'tactical-config', '更新战术分配配置', UPD_ERR, { ...ID_P, b: TAC_CFG_UPD }],
  ['delete', CFG_ID, 'tactical-config', '删除战术分配配置（软删除）', ANF_ERR, ID_P],
  ['get', '/portfolios', 'saas-portfolios', '列出已保存组合', [401]],
  ['get', '/portfolios/{id}', 'saas-portfolios', '查询组合详情', NF_ERR, ID_P],
  ['post', '/portfolios', 'saas-portfolios', '保存组合', [400, 401, 422], { b: pfBody }],
  ['put', '/portfolios/{id}', 'saas-portfolios', '更新组合', PUT_ERR, { ...ID_P, b: pfBody }],
  ['delete', '/portfolios/{id}', 'saas-portfolios', '删除组合', NF_ERR, ID_P],
  ['get', '/configs', 'saas-configs', '列出命名配置', [401]],
  ['get', '/configs/{id}', 'saas-configs', '查询配置详情', NF_ERR, ID_P],
  ['post', '/configs', 'saas-configs', '保存命名配置', [400, 401, 422], { b: cfgBody }],
  ['put', '/configs/{id}', 'saas-configs', '更新命名配置', PUT_ERR, { ...ID_P, b: cfgBody }],
  ['delete', '/configs/{id}', 'saas-configs', '删除命名配置', NF_ERR, ID_P],
  ['get', '/runs', 'saas-runs', '列出回测历史', [401]],
  ['get', '/runs/{id}', 'saas-runs', '查询回测历史详情', NF_ERR, ID_P],
  ['post', '/runs', 'saas-runs', '保存回测历史', [400, 401, 422], { b: runBody }],
  ['delete', '/runs/{id}', 'saas-runs', '删除回测历史', NF_ERR, ID_P],
];

function registerSpecialPaths(): void {
  reg('post', '/auth/login/password', 'auth', '用户名密码登录', [400, 401, 422, 429, 500], {
    pub: 1,
    b: loginPwd,
    d: '返回 accessToken/refreshToken',
  });
  reg('get', '/announcements', 'announcements', '获取公告列表（公开）', [500], {
    pub: 1,
    d: '当前有效的公告列表',
  });
  reg('post', '/backtest/portfolio', 'backtest', '组合回测', BT_ERR, {
    b: pfBt,
    a: AcceptedEnvelope,
    ad: '任务已入队，通过 GET /backtest/runs/:jobId 轮询结果',
  });
  reg('post', '/backtest/portfolio/series', 'backtest', '从缓存补全 Tab 序列', [400, 401, 422], {
    b: pfSer,
  });
  reg('get', '/backtest/runs/{jobId}', 'backtest', '查询异步回测任务状态', [400, 401, 404, 503], {
    p: z.object({ jobId: z.string() }),
  });
  reg('post', '/analysis/factor-regression', 'factor-regression', '因子回归分析', TAC_ERR, {
    b: facReg,
  });
  reg('post', '/backtest-optimizer/optimize', 'backtest-optimizer', '参数空间网格优化', BT_ERR, {
    b: btOpt,
  });
  reg('post', GOAL_PATH, 'goal-optimizer', '目标优化（蒙特卡洛达成概率）', BT_ERR, {
    b: goalO,
  });
  reg('post', '/calculators/{type}', 'calculators', '计算器（按类型）', TAC_ERR, {
    ...TYPE_P,
    b: calcB,
  });
  reg('get', '/tactical/configs', 'tactical-config', '列出当前租户的战术分配配置列表', AUTH_ERR, {
    q: PAGE_Q,
  });
}

/** 生成 OpenAPI 3.0 文档；重复调用会向全局 registry 重复注册（保持既有行为）。 */
export function generateOpenApiDocument() {
  for (const [m, p, t, s, e, x] of ROWS) reg(m, p, t, s, e, x);
  registerSpecialPaths();
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '回测平台 API',
      version: '1.0.0',
      description:
        '回测平台提供组合回测、资产分析、蒙特卡洛模拟、组合优化、有效前沿、战术分配、信号分析、PCA、LETF、目标优化等量化投资工具。\n\n## 认证\n- 计算端点必须携带 JWT Bearer Token（Authorization: Bearer <accessToken>）\n- 管理端点需 JWT + RBAC 权限\n- 兼容模式：x-api-key 请求头（过渡用，不推荐生产长期依赖）\n- 认证流程：POST /auth/login/password -> accessToken + refreshToken\n- 健康检查 /health 与 /metrics 无需用户 JWT\n\n## 速率限制\n- 普通 API：100 次/15 分钟/IP\n- 计算密集型 API（backtest、backtest-optimizer）：10 次/分钟/IP\n\n## 错误格式\n- 所有错误使用 RFC 7807 Problem Details：{ success: false, error: { type, title, status, code, detail } }\n- 数据服务降级响应包含 degraded: true + degradedWarning（仅数据端点；引擎端点 fail-closed 返回 503 + Retry-After，见 ADR-008）',
    },
    servers: [{ url: 'http://localhost:15001/api/v1', description: '本地开发环境' }],
    tags: TAGS.map((name) => ({ name })),
  });
}
