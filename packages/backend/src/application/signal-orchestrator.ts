/**
 * 信号分析编排器（Orchestrator）— 纯 fetch data + call engine，无 domain 交互。
 *
 * 合并了原两层模式（WithFetch + 纯转发），每个函数直接完成数据获取 + 引擎调用。
 * 计算逻辑在 Go 引擎 /api/engine/signal-analyze（ADR-031）。
 *
 * 命名约定（见 application/README.md）：纯透传到引擎、不涉及 domain 聚合根的编排器
 * 命名 *Orchestrator 并放在 application/，与涉及 domain 的 application service 区分。
 */
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal';
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { ensurePriceDataExists, ensureTickerHasData } from './backtest/priceDataUtils.js';

async function runSignalMode(
  mode: 'single' | 'dual' | 'multi',
  body: SignalAnalysisRequest | DualSignalConfig | MultiSignalConfig,
) {
  let tickers: string[];
  let startDate: string;
  let endDate: string;
  let validation: (history: Record<string, Record<string, number>>) => void;
  let engineBody: Record<string, unknown>;

  if (mode === 'single') {
    const b = body as SignalAnalysisRequest;
    tickers = [b.ticker];
    startDate = b.startDate;
    endDate = b.endDate;
    validation = (history) => {
      ensureTickerHasData(b.ticker, history);
    };
    engineBody = { mode: 'single', single: b };
  } else if (mode === 'dual') {
    const b = body as DualSignalConfig;
    tickers = Array.from(new Set([b.signal1.ticker, b.signal2.ticker]));
    startDate = b.signal1.startDate;
    endDate = b.signal1.endDate;
    validation = (history) => {
      ensurePriceDataExists([b.signal1.ticker, b.signal2.ticker], history, 'signal/dual');
    };
    engineBody = { mode: 'dual', dual: b };
  } else {
    const b = body as MultiSignalConfig;
    tickers = [b.signals[0].ticker];
    startDate = b.signals[0].startDate;
    endDate = b.signals[0].endDate;
    validation = (history) => {
      ensureTickerHasData(b.signals[0].ticker, history, 'signal/multi');
    };
    engineBody = { mode: 'multi', multi: b };
  }

  const { data: history } = await fetchHistoryData(tickers, startDate, endDate);
  validation(history);
  return callEngineStrict('/api/engine/signal-analyze', { ...engineBody, priceData: history });
}

/**
 * 单信号分析（含数据获取）。
 *
 * @throws {DataNotFoundError} 无价格数据
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export function executeSignalAnalyze(body: SignalAnalysisRequest) {
  return runSignalMode('single', body);
}

/**
 * 双信号分析（含数据获取）。
 *
 * @throws {DataNotFoundError} 无价格数据
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export function executeDualSignalAnalyze(body: DualSignalConfig) {
  return runSignalMode('dual', body);
}

/**
 * 多信号分析（含数据获取）。
 *
 * @throws {DataNotFoundError} 无价格数据
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export function executeMultiSignalAnalyze(body: MultiSignalConfig) {
  return runSignalMode('multi', body);
}
