// 纯透传到引擎、不涉及 domain 聚合根的编排器（ADR-031）
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal';
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { callEngineStrict, unwrapEngineData } from '../utils/engineClient.js';
import { ensurePriceDataExists, ensureTickerHasData } from './backtest/backtestEngineUtils.js';

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
    validation = (history) => ensureTickerHasData(b.ticker, history);
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
    tickers = Array.from(new Set(b.signals.map((s) => s.ticker)));
    startDate = b.signals[0].startDate;
    endDate = b.signals[0].endDate;
    validation = (history) => ensurePriceDataExists(tickers, history, 'signal/multi');
    engineBody = { mode: 'multi', multi: b };
  }

  const { data: history } = await fetchHistoryData(tickers, startDate, endDate);
  validation(history);
  return callEngineStrict('/api/engine/signal-analyze', {
    ...engineBody,
    priceData: history,
  }).then((r) => unwrapEngineData(r));
}

// @throws {DataNotFoundError} {EngineUnavailableError}
export function executeSignalAnalyze(body: SignalAnalysisRequest) {
  return runSignalMode('single', body);
}

// @throws {DataNotFoundError} {EngineUnavailableError}
export function executeDualSignalAnalyze(body: DualSignalConfig) {
  return runSignalMode('dual', body);
}

// @throws {DataNotFoundError} {EngineUnavailableError}
export function executeMultiSignalAnalyze(body: MultiSignalConfig) {
  return runSignalMode('multi', body);
}
