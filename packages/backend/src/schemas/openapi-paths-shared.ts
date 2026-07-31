/**
 * OpenAPI 路径注册共享辅助（BIG2 拆分产物）
 *
 * 从 openapi-paths.ts 拆出的高频复用项：错误码数组、params 结构、sec/pubReg/registerCrud。
 * 域文件（openapi-paths-{admin,auth,backtest,data}.ts）从本文件导入，保证各端点错误码一致。
 */
import { z } from 'zod';
import { reg, idParam } from './openapi-components.js';

type RegOpts = Parameters<typeof reg>[0];
export { idParam };

// 高频重复的 errors 数组与 params 结构，注册时直接复用（保证各端点错误码一致）
export const AUTH_ERR = [401, 403, 500];
export const AUTH_500_ERR = [401, 500];
export const PERM_ERR = [401, 403];
export const ID_ERR = [401, 403, 404];
export const NOT_FOUND_ERR = [401, 404];
export const AUTH_NOT_FOUND_ERR = [401, 403, 404, 500];
export const VALIDATION_ERR = [400, 401, 403, 422, 500];
export const VALIDATION_CONFLICT_ERR = [400, 401, 403, 422, 409, 500];
export const UPDATE_ERR = [400, 401, 403, 404, 422, 500];
export const BACKTEST_ERR = [400, 401, 422, 500, 503];
export const TACTICAL_ERR = [400, 401, 422, 503];
const CRUD_CREATE_ERR = [400, 401, 422];
const CRUD_UPDATE_ERR = [400, 401, 404, 422];
export const STATUS_ERR = [401, 503];
export const WITH_ID_PARAM = { params: idParam() } as const;
export const WITH_USER_ID_PARAM = { params: idParam('userId') } as const;
export const USER_ROLE_PARAM = {
  params: z.object({ userId: z.string(), roleId: z.string() }),
} as const;
export const PAGINATION_QUERY = z.object({
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export const ROLE_BODY = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  permissions: z.array(z.string()),
});
export const KEY_BODY = z.object({ name: z.string().max(120) });
export const TEST_EXTRA = { ...WITH_ID_PARAM, body: z.object({}) } as const;

// eslint-disable-next-line max-params -- OpenAPI 路径注册 DSL，参数为注册项字段
export function sec(
  method: RegOpts['method'],
  path: string,
  tag: string,
  summary: string,
  errors: number[],
  extra: Partial<Omit<RegOpts, 'method' | 'path' | 'tag' | 'summary' | 'errors' | 'security'>> = {},
): void {
  reg({ method, path, tag, summary, errors, security: true, ...extra });
}

/** 公开（无认证）端点注册，okDescription 仅 get 探针类使用。 */
// eslint-disable-next-line max-params -- OpenAPI 路径注册 DSL，参数为注册项字段
export function pubReg(
  method: RegOpts['method'],
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

export function registerCrud(opts: CrudOpts): void {
  sec('get', opts.basePath, opts.tag, opts.listSummary, [401]);
  sec('get', `${opts.basePath}/{id}`, opts.tag, opts.getSummary, NOT_FOUND_ERR, WITH_ID_PARAM);
  if (opts.createBody)
    sec('post', opts.basePath, opts.tag, opts.createSummary!, CRUD_CREATE_ERR, {
      body: opts.createBody,
    });
  if (opts.updateBody)
    sec('put', `${opts.basePath}/{id}`, opts.tag, opts.updateSummary!, CRUD_UPDATE_ERR, {
      ...WITH_ID_PARAM,
      body: opts.updateBody,
    });
  sec('delete', `${opts.basePath}/{id}`, opts.tag, opts.deleteSummary, NOT_FOUND_ERR, {
    ...WITH_ID_PARAM,
  });
}
