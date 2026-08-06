import { z } from 'zod';
import {
  sec,
  STATUS_ERR,
  AUTH_ERR,
  AUTH_500_ERR,
  AUTH_NOT_FOUND_ERR,
  VALIDATION_ERR,
  UPDATE_ERR,
  WITH_ID_PARAM,
  PAGINATION_QUERY,
} from './openapi-paths-shared.js';
import { tickerListQuerySchema, tickerSearchQuerySchema } from './analysisSchemas.js';

function registerDataEndpoints(): void {
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
}

function registerDataManageQueryPaths(): void {
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
}

function registerDataManageUpdatePaths(): void {
  sec('get', '/data/manage/update/status', 'data-manage', '更新任务状态', [401]);
  sec('put', '/data/manage/update/full', 'data-manage', '触发全量更新', [401, 403, 409, 503]);
  sec('patch', '/data/manage/update/inc', 'data-manage', '触发增量更新', [401, 403, 503]);
  sec('post', '/data/manage/update/stop', 'data-manage', '停止更新任务', [401, 403, 409]);
  sec('put', '/data/manage/universe', 'data-manage', '更新标的池', [401, 403, 422]);
  sec('put', '/data/manage/regenerate-meta', 'data-manage', '重生成标的元数据', [401, 403, 503]);
}

function registerTacticalConfigPaths(): void {
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

export function registerDataPaths(): void {
  registerDataEndpoints();
  registerDataManageQueryPaths();
  registerDataManageUpdatePaths();
  registerTacticalConfigPaths();
}
