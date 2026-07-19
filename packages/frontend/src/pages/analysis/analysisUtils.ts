/**
 * @file 资产分析页面纯函数与异步编排
 * @description 承载错误解析、超时控制与 analysis API 调用，以及 Tab 元数据
 */
import type { AssetAnalysisResult } from '@backtest/shared';
import { apiFetch } from '../../utils/apiClient.js';
import { downsample } from '../../hooks/useChartInteractions.js';

/** Tab 元数据（key + i18n label key） */
export const TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'correlations', labelKey: 'tabs.correlationsBeta' },
  { key: 'rolling', labelKey: 'tabs.rollingMetrics' },
  { key: 'risk-return', labelKey: 'tabs.riskVsReturn' },
  { key: 'returns', labelKey: 'tabs.returns' },
] as const;

/** 从 RFC 7807 错误响应中提取 detail 字段 */
function extractErrorDetail(j: Record<string, unknown>, fallback: string): string {
  const err = j.error;
  if (typeof err === 'object' && err && 'detail' in err)
    return String((err as { detail?: string }).detail);
  if (typeof err === 'string') return err;
  return fallback;
}

/** 当响应不成功或 success=false 时抛错 */
function throwIfError(res: Response, json: Record<string, unknown>, failedMsg: string) {
  if (!res.ok) throw new Error(extractErrorDetail(json, `HTTP ${res.status}`));
  if (json.success === false) throw new Error(extractErrorDetail(json, failedMsg));
}

/** 将网络/超时错误转换为用户友好的消息 */
function wrapFetchError(e: unknown, timeoutMsg: string, networkMsg: string): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return new Error(timeoutMsg);
  if (e instanceof TypeError && e.message.includes('fetch')) return new Error(networkMsg);
  return e instanceof Error ? e : new Error(String(e));
}

/** 拉取资产分析结果（带 180s 超时与曲线降采样） */
export async function fetchAnalysisResult(
  validTickers: string[],
  ctx: {
    startDate: string;
    endDate: string;
    startingValue: number;
    adjustForInflation: boolean;
    rollingWindow: number;
    correlationWindow: number;
  },
  t: (k: string) => string,
): Promise<AssetAnalysisResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await apiFetch('/api/backtest/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        tickers: validTickers,
        parameters: {
          startDate: ctx.startDate,
          endDate: ctx.endDate,
          startingValue: ctx.startingValue,
          adjustForInflation: ctx.adjustForInflation,
          rollingWindowMonths: ctx.rollingWindow,
          correlationWindowMonths: ctx.correlationWindow,
          benchmarkTicker: '',
          baseCurrency: 'usd',
          extendedWithdrawalStats: false,
          cashflowLegs: [],
          oneTimeCashflows: [],
        },
      }),
    });
    let json: Record<string, unknown>;
    try {
      json = await res.json();
    } catch {
      throw new Error(t('dataEngine.serverAbnormal'));
    }
    throwIfError(res, json, t('analysis.analysisFailed'));
    const raw = (json.data ?? json) as Record<string, unknown>;
    const tickers = (raw.tickers ?? raw.assets ?? []) as AssetAnalysisResult['tickers'];
    // 提前降采样显示数据，减少 React 渲染压力（dailyReturns 保留用于滚动指标计算）
    for (const tk of tickers) {
      if (tk.growthCurve && tk.growthCurve.length > 500)
        tk.growthCurve = downsample(tk.growthCurve, 500);
      if (tk.drawdownCurve && tk.drawdownCurve.length > 500)
        tk.drawdownCurve = downsample(tk.drawdownCurve, 500);
    }
    return { tickers, correlations: (raw.correlations ?? []) as number[][] };
  } catch (e) {
    throw wrapFetchError(e, t('dataEngine.connectionTimeout'), t('dataEngine.networkError'));
  } finally {
    clearTimeout(timeoutId);
  }
}
