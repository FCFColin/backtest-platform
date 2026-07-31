import { useToastStore } from '../store/toastStore.js';
import { getWarningI18nKey, getWarningInterpolationParams, type WarningInfo } from './errorReporter.js';
import type { DateRangeInfo } from '../store/types.js';
import i18n from '../i18n/index.js';
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
        useToastStore.getState().addToast('warning', warn.message ? `${message} - ${warn.message}` : message);
      }
    }
  }
  return warningsList;
}
export function extractDateRange(json: Record<string, unknown>, warnings: WarningInfo[]): DateRangeInfo | null {
  const dr = json.dateRange as DateRangeInfo | undefined;
  if (dr) return dr;
  const clampedWarn = warnings.find((w) => w.code === 'DATE_RANGE_CLAMPED');
  if (clampedWarn) {
    return {
      requested: { start: clampedWarn.requestedStart || '', end: clampedWarn.requestedEnd || '' },
      actual: { start: clampedWarn.actualStart || '', end: clampedWarn.actualEnd || '' },
      clamped: true,
      missingTickers: clampedWarn.tickers
    };
  }
  return null;
}
