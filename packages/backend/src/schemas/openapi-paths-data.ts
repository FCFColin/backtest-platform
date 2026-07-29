/**
 * OpenAPI 路径注册 —— data / data-manage / data-custom / tactical-config
 * （D6-002 拆分自 openapi-registry.ts）。
 *
 * 涵盖行情数据查询、数据引擎管理、用户自定义 ticker、
 * 以及战术分配配置的租户级持久化。
 */
import { z } from 'zod';
import { reg, idParam } from './openapi-components.js';
import { historyQuerySchema, searchQuerySchema } from './data.js';
import { tickerListQuerySchema, tickerSearchQuerySchema } from './dataManage.js';

/** 注册 data 路径（历史行情/搜索/CPI）。 */
function registerDataEndpoints(): void {
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
  reg({
    method: 'get',
    path: '/data/synthetic',
    tag: 'data',
    summary: '获取合成标的列表（用于长历史回测的多段数据拼接）',
    security: true,
    okDescription: '合成标的列表',
    errors: [401, 500],
  });
  reg({
    method: 'get',
    path: '/data/meta',
    tag: 'data',
    summary: '获取数据元信息（最后更新/标的数/最早日期/数据点数）',
    security: true,
    okDescription: '数据元信息（lastUpdated/tickerCount/earliestDate/dataPointCount）',
    errors: [401, 500],
  });
  reg({
    method: 'get',
    path: '/data/ticker-meta',
    tag: 'data',
    summary: '查询单个 ticker 元数据',
    security: true,
    query: z.object({ ticker: z.string() }),
    okDescription: 'Ticker 元数据（name/exchange/currency/earliestDate/isSynthetic）',
    errors: [400, 401],
  });
  reg({
    method: 'get',
    path: '/data/recent-updates',
    tag: 'data',
    summary: '获取最近更新的标的列表',
    security: true,
    query: z.object({ limit: z.number().optional() }),
    okDescription: '最近更新的标的列表（ticker/name/last_bar_date/updated_at）',
    errors: [401, 500],
  });
}

/** 注册 data-manage 查询路径（状态/统计/标的列表/搜索/单个标的）。 */
function registerDataManageQueryPaths(): void {
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
    path: '/data/manage/last-updated',
    tag: 'data-manage',
    summary: '获取数据最后更新日期（MAX(updated_at)，30s 缓存）',
    security: true,
    okDescription: '最后更新日期（lastUpdated）',
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
    path: '/data/manage/ticker/{id}',
    tag: 'data-manage',
    summary: '查询单个标的信息',
    security: true,
    params: idParam(),
    errors: [400, 401, 404],
  });
}

/** 注册 data-manage 更新路径（全量/增量/恢复/停止/标的池/重生成元数据）。 */
function registerDataManageUpdatePaths(): void {
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
    method: 'put',
    path: '/data/manage/regenerate-meta',
    tag: 'data-manage',
    summary: '重生成标的元数据',
    security: true,
    errors: [401, 403, 503],
  });
}

/** 注册 data-custom 路径（用户自定义 ticker 数据的 CRUD）。 */
function registerDataCustomPaths(): void {
  reg({
    method: 'get',
    path: '/data/custom',
    tag: 'data-custom',
    summary: '列出当前租户创建的自定义 ticker 数据（含 symbol 映射，类型，是否激活等字段）',
    security: true,
    okDescription: '当前租户的自定义 ticker 列表，每项含 id（自动生成的 v4 uuid），symbol 映射，isActive 等',
    errors: [401, 403, 500],
  });
  reg({
    method: 'post',
    path: '/data/custom',
    tag: 'data-custom',
    summary: '创建集群 ticker 数据（触发后台任务以获取所需的分钟级行情数据）',
    security: true,
    body: z.object({
      symbol: z.string().min(1).max(50),
      name: z.string().min(1).max(255),
      exchange: z.string().optional(),
      currency: z.string().optional(),
    }),
    okDescription: '新建成功的一个 id（用于后续轮询的 job id）以及内部生成的自定义 ticker 数据',
    errors: [400, 401, 403, 422, 409, 500],
  });
  reg({
    method: 'delete',
    path: '/data/custom/{id}',
    tag: 'data-custom',
    summary: '删除自定义 ticker 数据（包括该 ticker 相关的缓存的行情数据，以及外部数据源对该 ticker 的任何引用）',
    security: true,
    params: idParam(),
    okDescription: '删除成功的自定义 ticker id 与 deleted: true（表示该 id 的数据已从当前租户删除）',
    errors: [401, 403, 404, 500],
  });
}

/** 注册 tactical-config 路径（战术分配配置的持久化存储，ADR-034）。 */
function registerTacticalConfigPaths(): void {
  reg({
    method: 'get',
    path: '/tactical/configs',
    tag: 'tactical-config',
    summary: '列出当前租户的战术分配配置列表（分页，默认每页 50）',
    security: true,
    query: z.object({
      limit: z.number().optional(),
      offset: z.number().optional(),
    }),
    okDescription: '当前租户的战术分配配置列表',
    errors: [401, 403, 500],
  });
  reg({
    method: 'get',
    path: '/tactical/configs/{id}',
    tag: 'tactical-config',
    summary: '查询单个战术分配配置的详情',
    security: true,
    params: idParam(),
    okDescription: '一个战术分配配置的全部字段（含 chart，cs，longSort，shortSort 等字段）',
    errors: [401, 403, 404, 500],
  });
  reg({
    method: 'post',
    path: '/tactical/configs',
    tag: 'tactical-config',
    summary: '新建战术分配配置（含 chart 配置，cs，longSort，shortSort 各字段以及展示用的 name）',
    security: true,
    body: z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      chart: z.string().optional(),
      cs: z.string().optional(),
      longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
      shortSort: z.enum(['rising', 'alpha']).optional(),
    }),
    okDescription: '新建成功的配置含自动生成的 id 与 description',
    errors: [400, 401, 403, 422, 500],
  });
  reg({
    method: 'put',
    path: '/tactical/configs/{id}',
    tag: 'tactical-config',
    summary: '更新战术分配配置（可更新 name 与各字段，以及 alpha 和 beta 类的相关字段）',
    security: true,
    params: idParam(),
    body: z.object({
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(255).optional(),
      cs: z.string().optional(),
      longSort: z.enum(['alpha', 'beta', 'rsq']).optional(),
      chart: z.string().optional(),
    }),
    okDescription: '更新后的配置，含 cs 与 alpha 相关字段的最新值',
    errors: [400, 401, 403, 404, 422, 500],
  });
  reg({
    method: 'delete',
    path: '/tactical/configs/{id}',
    tag: 'tactical-config',
    summary: '删除战术分配配置（软删除，将配置的 apply 状态置为 disabled，并记录执行的 actor 与原因）',
    security: true,
    params: idParam(),
    okDescription: '删除成功的配置（含已删除的配置 id）以及该 id 关联的审计日志的 id',
    errors: [401, 403, 404, 500],
  });
}

/**
 * 注册 data / data-manage / data-custom / tactical-config 路径。
 */
export function registerDataPaths(): void {
  registerDataEndpoints();
  registerDataManageQueryPaths();
  registerDataManageUpdatePaths();
  registerDataCustomPaths();
  registerTacticalConfigPaths();
}