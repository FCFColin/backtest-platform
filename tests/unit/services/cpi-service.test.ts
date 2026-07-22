/**
 * cpiService 单元测试 — loadCpiMap + fetchCpiForRoute + 三级降级策略
 *
 * 覆盖：fetchCpiForRoute 三级降级（Go → 缓存 → PG → notFound）、
 * loadCpiMap 缓存命中/未命中/PG-空-Go-fallback、fetchCpiMapFromGo 扁平化（date slice 0-10）。
 *
 * Mock 策略：mock callGoDataService + loadCpiSeriesFromDb + logger。
 * cpiCache 是模块私有状态，通过给每个测试分配独立 country 隔离缓存污染。
 *
 * 缓存命中场景在单个测试内做两次调用（第一次写入，第二次命中），保证测试独立性。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const goMocks = vi.hoisted(() => ({
  callGoDataService: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  loadCpiSeriesFromDb: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataQuery.js', () => ({
  callGoDataService: goMocks.callGoDataService,
}));

vi.mock('../../../packages/backend/src/db/macroData.js', () => ({
  loadCpiSeriesFromDb: dbMocks.loadCpiSeriesFromDb,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import {
  loadCpiMap,
  fetchCpiForRoute,
} from '../../../packages/backend/src/infrastructure/cpiLoader.js';

describe('cpiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.loadCpiSeriesFromDb.mockResolvedValue([]);
    goMocks.callGoDataService.mockResolvedValue(JSON.stringify({ success: false, data: null }));
  });

  describe('fetchCpiForRoute - 三级降级', () => {
    it('Go 服务可用时返回 Go 原始数据，不标记降级', async () => {
      const goData = [{ date: '2020-01-01', value: 258.8 }];
      goMocks.callGoDataService.mockResolvedValueOnce(
        JSON.stringify({ success: true, data: goData }),
      );

      const result = await fetchCpiForRoute('us');

      expect(result).toEqual({ data: goData, degraded: false, notFound: false });
      expect(dbMocks.loadCpiSeriesFromDb).not.toHaveBeenCalled();
    });

    it('Go 不可用 + PG 有数据 → degraded=true 并附带降级提示', async () => {
      const pgData = [{ date: '2020-01-01', value: 258.8 }];
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce(pgData);

      const result = await fetchCpiForRoute('cn');

      expect(result.degraded).toBe(true);
      expect(result.notFound).toBe(false);
      expect(result.data).toEqual(pgData);
      expect(result.degradedWarning).toContain('PostgreSQL');
    });

    it('Go 不可用 + PG 空 → notFound=true', async () => {
      const result = await fetchCpiForRoute('uk');

      expect(result).toEqual({ data: null, degraded: false, notFound: true });
    });

    it('Go 不可用 + 缓存命中（同一 country 第二次调用）→ degraded=true 返回缓存', async () => {
      // 第一次：Go 失败 + PG 成功 → 写入 routeData 缓存
      const pgData = [{ date: '2020-01-01', value: 258.8 }];
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce(pgData);
      const first = await fetchCpiForRoute('de');
      expect(first.degraded).toBe(true);

      // 第二次：Go 仍失败，PG 不应被再次调用（命中缓存）
      const second = await fetchCpiForRoute('de');

      expect(second.degraded).toBe(true);
      expect(second.notFound).toBe(false);
      expect(second.data).toEqual(pgData);
      // PG 仅在第一次调用
      expect(dbMocks.loadCpiSeriesFromDb).toHaveBeenCalledTimes(1);
    });

    it('Go 返回 success=false 时视为不可用，降级到 PG', async () => {
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([{ date: '2020-01', value: 1 }]);

      const result = await fetchCpiForRoute('fr');

      expect(result.degraded).toBe(true);
    });

    it('Go 服务抛异常时捕获并降级到 PG', async () => {
      goMocks.callGoDataService.mockRejectedValueOnce(new Error('go boom'));
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([{ date: '2020-01', value: 1 }]);

      const result = await fetchCpiForRoute('ca');

      expect(result.degraded).toBe(true);
      expect(loggerMocks.warn).toHaveBeenCalled();
    });
  });

  describe('loadCpiMap - PG 主路径 + Go fallback + 缓存', () => {
    it('PG 主路径有数据 → 返回 { date: value } 映射', async () => {
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([
        { date: '2020-01-01', value: 258.8 },
        { date: '2020-02-01', value: 259.1 },
      ]);

      const map = await loadCpiMap('JP');

      expect(map).toEqual({
        '2020-01-01': 258.8,
        '2020-02-01': 259.1,
      });
      // PG 收到小写 country
      expect(dbMocks.loadCpiSeriesFromDb).toHaveBeenCalledWith('jp');
      // Go fallback 不应被调用
      expect(goMocks.callGoDataService).not.toHaveBeenCalled();
    });

    it('缓存命中：同一 country 第二次调用不再访问 PG', async () => {
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([{ date: '2020-01-01', value: 1 }]);

      await loadCpiMap('BR');
      const second = await loadCpiMap('BR');

      expect(second).toEqual({ '2020-01-01': 1 });
      expect(dbMocks.loadCpiSeriesFromDb).toHaveBeenCalledTimes(1);
    });

    it('PG 空 + Go fallback 有数据 → 扁平化为 { date: value }，date 取 slice(0,10)', async () => {
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([]);
      goMocks.callGoDataService.mockResolvedValueOnce(
        JSON.stringify({
          success: true,
          data: [
            { date: '2020-01-01T00:00:00Z', value: 258.8 },
            { date: '2020-02-01T12:34:56Z', value: 259.1 },
          ],
        }),
      );

      const map = await loadCpiMap('AU');

      // date 应被 slice(0, 10) 截断为 YYYY-MM-DD
      expect(map).toEqual({
        '2020-01-01': 258.8,
        '2020-02-01': 259.1,
      });
    });

    it('PG 空 + Go fallback 也空 → 返回空对象且不写缓存', async () => {
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([]);
      goMocks.callGoDataService.mockResolvedValueOnce(JSON.stringify({ success: true, data: [] }));

      const map = await loadCpiMap('KR');

      expect(map).toEqual({});
      // 再次调用相同 country，PG 仍应被调用（说明未缓存空结果）
      dbMocks.loadCpiSeriesFromDb.mockResolvedValueOnce([]);
      goMocks.callGoDataService.mockResolvedValueOnce(JSON.stringify({ success: true, data: [] }));
      await loadCpiMap('KR');
      expect(dbMocks.loadCpiSeriesFromDb).toHaveBeenCalledTimes(2);
    });
  });
});
