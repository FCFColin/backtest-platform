/**
 * 信号分析应用服务（T-30 / CQRS Command）
 *
 * 路由层经此服务调用引擎，避免路由直接 import api/engine/*。
 */
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '../../shared/types/signal.js';
import { toPriceSeries } from '../engine/seriesUtils.js';
import { analyzeSignal, analyzeDualSignal, analyzeMultiSignal } from '../engine/signal.js';

/**
 * 单信号分析。
 *
 * @throws Error 无价格数据
 */
export function executeSignalAnalyze(
  body: SignalAnalysisRequest,
  history: Record<string, Record<string, number>>,
) {
  const data = toPriceSeries(history[body.ticker]);
  if (data.length === 0) {
    throw new Error(`未找到 ${body.ticker} 的价格数据`);
  }
  return analyzeSignal(body, data);
}

/**
 * 双信号分析。
 *
 * @throws Error 无价格数据
 */
export function executeDualSignalAnalyze(
  body: DualSignalConfig,
  history: Record<string, Record<string, number>>,
) {
  const { signal1: cfg1, signal2: cfg2, combinationMethod } = body;
  const data1 = toPriceSeries(history[cfg1.ticker]);
  const data2 = toPriceSeries(history[cfg2.ticker]);
  if (data1.length === 0 || data2.length === 0) {
    throw new Error('未找到价格数据');
  }
  return analyzeDualSignal(cfg1, cfg2, data1, data2, combinationMethod);
}

/**
 * 多信号分析。
 *
 * @throws Error 无价格数据
 */
export function executeMultiSignalAnalyze(
  body: MultiSignalConfig,
  history: Record<string, Record<string, number>>,
) {
  const { signals: configs, aggregationMethod, weights } = body;
  const ticker = configs[0].ticker;
  const data = toPriceSeries(history[ticker]);
  if (data.length === 0) {
    throw new Error('未找到价格数据');
  }
  return analyzeMultiSignal(configs, data, aggregationMethod, weights);
}
