/**
 * OpenAPI 3.0 共享组件与路径注册辅助（P1-05，D6-002 拆分自 openapi-registry.ts）。
 *
 * 本文件是 schema -> OpenAPI 的共享基础设施：
 * - 扩展 Zod 以支持 .openapi() 元数据
 * - 维护全局 OpenAPIRegistry 单例
 * - 注册通用安全方案 / 幂等键 / RFC 7807 错误结构 / 成功信封
 * - 提供 reg() 路径注册辅助函数，压缩重复结构
 *
 * 各 openapi-paths-*.ts 模块通过调用 registerXxxPaths() 注册具体端点。
 */
import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

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
export const AcceptedEnvelope = registry.register(
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

/**
 * 注册单个 OpenAPI 路径，统一处理 security/body/params/query/responses。
 *
 * @param opts - 路径注册选项（method/path/tag/summary 等）
 */
export function reg(opts: RegPathOpts): void {
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

/**
 * 创建标准 id 路径参数 schema。
 *
 * @param name - 参数名（默认 'id'）
 * @returns z.object({ [name]: z.string() })
 */
export function idParam(name = 'id') {
  return z.object({ [name]: z.string() });
}
