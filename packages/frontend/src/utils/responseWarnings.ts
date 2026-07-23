/**
 * @file API 响应公共处理：警告解析与日期范围提取
 * @description 从 backtest/analysis API 响应中解析 warnings 数组（转 toast + 收集 WarningInfo）
 *              与 dateRange 信息（含 DATE_RANGE_CLAMPED 回退）。原先在 executionSlice 与
 *              analysisUtils 中各有一份完全相同的实现，此处统一为单一来源。
 */
import { useToastStore } from '../store/toastStore.js';
import {
  getWarningI18nKey,
  getWarningInterpolationParams,
  type WarningInfo,
} from './errorI18nMap.js';
import type { DateRangeInfo } from '../store/types.js';
import i18n from '../i18n/index.js';

/**
 * 解析响应中的 warnings 字段，对每条警告推送 toast 并收集结构化 WarningInfo。
 *
 * @param json - API 响应 JSON 对象
 * @returns 结构化警告列表（已过滤非对象警告）
 */
export function processResponseWarnings(json: Record<string, unknown>): WarningInfo[] {
  const rawWarnings = json.warnings;
  const warningsList: WarningInfo[] = [];
  if (Array.isArray(rawWarnings) && rawWarnings.length > 0) {
    for (const w of rawWarnings) {
      if (typeof w === 'string') {
        useToastStore.getState().addToast('warning', w);
      } else if (w && typeof w === 'object') {
        const warn = w as WarningInfo;
        warningsList.push(warn);
        const key = getWarningI18nKey(warn.code);
        const params = getWarningInterpolationParams(warn);
        const message = i18n.t(key, params);
        useToastStore.getState().addToast('warning', warn.message ? `${message} — ${warn.message}` : message);
      }
    }
  }
  return warningsList;
}

/**
 * 从响应中提取日期范围信息。优先取 json.dateRange，回退到 DATE_RANGE_CLAMPED 警告。
 *
 * @param json - API 响应 JSON 对象
 * @param warnings - 已解析的警告列表（用于回退查找）
 * @returns 日期范围信息，无则 null
 */
export function extractDateRange(json: Record<string, unknown>, warnings: WarningInfo[]): DateRangeInfo | null {
  const dr = json.dateRange as DateRangeInfo | undefined;
  if (dr) return dr;
  const clampedWarn = warnings.find(w => w.code === 'DATE_RANGE_CLAMPED');
  if (clampedWarn) {
    return {
      requested: { start: clampedWarn.requestedStart || '', end: clampedWarn.requestedEnd || '' },
      actual: { start: clampedWarn.actualStart || '', end: clampedWarn.actualEnd || '' },
      clamped: true,
      missingTickers: clampedWarn.tickers,
    };
  }
  return null;
}
