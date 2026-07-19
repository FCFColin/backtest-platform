/**
 * CPI 数据访问统一 facade。
 *
 * 收敛三套并存的 CPI 读取路径：
 * 1. db/macroData.ts loadCpiSeriesFromDb（TS 直查 PG cpi_data 表）
 * 2. services/cpiService.ts fetchCpiFromGoService（TS 调 Go data-fetcher）
 * 3. data-fetcher/main.go handleCPI（Go 直查 PG，对 TS 透明）
 *
 * 两类消费入口：
 * - loadCpiMap：回测引擎用 `{ date: value }` 映射。PG 主路径，PG 无数据 fallback Go。
 * - fetchCpiForRoute：/api/data/cpi/:country 路由用。Go 主路径，Go 不可用走 内存缓存 → PG → 404。
 *
 * 降级顺序差异是历史接口约定：路由对外承诺 Go 优先（Go 不可用才标记 degraded），
 * 引擎内部承诺 PG 优先（PG 即主源）。两者读同一张 cpi_data 表，数据等价。
 *
 * 企业理由：消除三套读取路径的分裂，让 CPI 数据获取行为统一可观测、可降级。
 */

import { loadCpiSeriesFromDb } from '../db/macroData.js';
import { callGoDataService } from '../infrastructure/dataQueryService.js';
import { logger } from '../utils/logger.js';

interface CpiCacheEntry {
  map?: Record<string, number>;
  routeData?: unknown;
}

/** CPI 内存缓存（country 小写键 → 双格式入口） */
const cpiCache: Record<string, CpiCacheEntry> = {};

/**
 * 调用 Go data-fetcher 获取 CPI 数据（原始响应格式）。
 *
 * 路由层 /api/data/cpi/:country 通过此函数获取 Go 服务的原始数组格式
 * `[{ date, value }, ...]`，无需自行定义 HTTP 客户端。Go 服务不可用时返回 null。
 *
 * @param country - `us` 或 `cn`
 * @returns Go 服务响应的 CPI 数据；Go 服务不可用或返回异常时返回 null
 */
async function fetchCpiFromGoService(country: string): Promise<unknown | null> {
  try {
    const response = await callGoDataService(`/api/data/cpi/${country}`);
    const parsed = JSON.parse(response) as { success?: boolean; data?: unknown };
    if (parsed.success && parsed.data) {
      return parsed.data;
    }
    return null;
  } catch (err) {
    logger.warn({ err: err as Error, country }, '[cpiService] Go data-fetcher CPI 调用失败');
    return null;
  }
}

/**
 * 调用 Go data-fetcher 获取 CPI 序列并归一化为 `{ date: value }` 映射。
 *
 * Go 服务返回 `{ success, data: [{ date, value }, ...] }` 数组格式；
 * 本函数将其扁平化为回测引擎使用的映射格式。Go 不可用或返回异常时返回空对象。
 *
 * @param country - `us` 或 `cn`（小写）
 * @returns `{ date: value }` 映射；无数据或调用失败时返回空对象
 */
async function fetchCpiMapFromGo(country: string): Promise<Record<string, number>> {
  const data = await fetchCpiFromGoService(country);
  if (!Array.isArray(data)) return {};
  const map: Record<string, number> = {};
  for (const item of data as Array<{ date: string; value: number }>) {
    if (!item || typeof item.date !== 'string') continue;
    map[item.date.slice(0, 10)] = item.value;
  }
  return map;
}

/**
 * 加载 CPI 映射 `{ date: value }`（回测引擎格式）。
 *
 * 主路径：直查 PostgreSQL（cpi_data 表，via loadCpiSeriesFromDb）。
 * Fallback：PG 不可用或返回空时，调 Go data-fetcher 的 /api/data/cpi/:country 端点。
 * 内存缓存：按 country 小写键缓存非空结果，进程内有效；空结果不缓存以避免阻塞恢复。
 * 错误处理：PG 与 Go 都失败时返回空对象（与原 loadCpiMapFromDb 行为一致）。
 *
 * @param country - `us` 或 `cn`（大小写不敏感）
 * @returns `{ date: value }` 映射；无数据或全部降级失败时返回空对象
 */
export async function loadCpiMap(country: string): Promise<Record<string, number>> {
  const key = country.toLowerCase();
  if (cpiCache[key]?.map) return cpiCache[key]!.map!;

  // 主路径：PostgreSQL（loadCpiSeriesFromDb 内部已捕获异常，失败返回空数组）
  const series = await loadCpiSeriesFromDb(key);
  let cpiMap: Record<string, number> = {};
  for (const item of series) cpiMap[item.date] = item.value;

  // Fallback：PG 无数据时调 Go data-fetcher
  if (Object.keys(cpiMap).length === 0) {
    cpiMap = await fetchCpiMapFromGo(key);
  }

  // 缓存非空结果（空结果不缓存，避免阻塞后续恢复）
  if (Object.keys(cpiMap).length > 0) {
    cpiCache[key] = { ...cpiCache[key], map: cpiMap };
  }
  return cpiMap;
}

/** Go 服务不可用时的统一降级提示文案 */
const CPI_DEGRADED_WARNING = 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据';

/**
 * /api/data/cpi/:country 路由的数据加载结果。
 *
 * 路由层据此格式化响应：notFound=true 映射 404，degraded=true 时附带降级标记。
 * cpiService 不感知 HTTP，由路由负责 sendProblem 与 JSON 结构。
 */
interface CpiRouteResult {
  /** CPI 数据（Go 原始响应或 PG `[{date, value}]` 数组） */
  data: unknown;
  /** 是否从 PG 降级路径获取（Go 服务不可用） */
  degraded: boolean;
  /** 降级说明（degraded=true 时附带） */
  degradedWarning?: string;
  /** Go 与 PG 均无数据，路由应返回 404 */
  notFound: boolean;
}

/**
 * 为 /api/data/cpi/:country 路由加载 CPI 数据，封装三级降级策略与内存缓存。
 *
 * 降级顺序（与原 dataRoutes 内联逻辑等价）：Go data-fetcher → 内存缓存 → PostgreSQL → 404。
 * - Go 服务可用：返回 Go 原始响应数据，不标记降级。
 * - Go 不可用且缓存命中：返回缓存数据，标记降级。
 * - Go 不可用且缓存未命中：直查 PostgreSQL（loadCpiSeriesFromDb），命中则缓存并标记降级。
 * - 全部失败：返回 notFound=true，路由映射为 404。
 *
 * 企业理由：将原 dataRoutes 的三级降级 + 模块级 cpiDbCache 下沉至 service 层，
 * 路由仅做参数解析与响应格式化，service 层统一持有缓存与降级策略。
 *
 * @param country - `us` 或 `cn`（小写，路由已校验）
 * @returns 路由消费结果；notFound=true 时路由应返回 404
 */
export async function fetchCpiForRoute(country: string): Promise<CpiRouteResult> {
  // 1. Go data-fetcher
  const goResult = await fetchCpiFromGoService(country);
  if (goResult) {
    return { data: goResult, degraded: false, notFound: false };
  }

  // 2. 内存缓存
  if (cpiCache[country]?.routeData) {
    return {
      data: cpiCache[country]!.routeData,
      degraded: true,
      degradedWarning: CPI_DEGRADED_WARNING,
      notFound: false,
    };
  }

  // 3. PostgreSQL（loadCpiSeriesFromDb 内部已捕获异常，失败返回空数组）
  const cpiData = await loadCpiSeriesFromDb(country);
  if (cpiData.length > 0) {
    cpiCache[country] = { ...cpiCache[country], routeData: cpiData };
    return {
      data: cpiData,
      degraded: true,
      degradedWarning: CPI_DEGRADED_WARNING,
      notFound: false,
    };
  }

  // 4. 全失败
  return { data: null, degraded: false, notFound: true };
}
