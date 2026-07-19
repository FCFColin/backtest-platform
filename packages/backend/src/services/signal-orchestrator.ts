/**
 * 信号分析编排器（Orchestrator）— 纯 fetch data + call engine，无 domain 交互。
 *
 * 合并了原两层模式（WithFetch + 纯转发），每个函数直接完成数据获取 + 引擎调用。
 * 计算逻辑在 Go 引擎 /api/engine/signal-analyze（ADR-031）。
 *
 * 命名约定（见 application/README.md）：纯透传到引擎、不涉及 domain 聚合根的编排器
 * 命名 *Orchestrator 并放在 services/，与涉及 domain 的 application service 区分。
 */
import type {
  SignalAnalysisRequest,
  DualSignalConfig,
  MultiSignalConfig,
} from '@backtest/shared/types/signal';
import { fetchHistoryData } from './dataService.js';
import { callEngineStrict } from '../utils/engineClient.js';
import {
  ensurePriceDataExists,
  ensureTickerHasData,
} from '../application/backtest/priceDataUtils.js';

/**
 * 单信号分析（含数据获取）。
 *
 * @throws {DataNotFoundError} 无价格数据
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function executeSignalAnalyze(body: SignalAnalysisRequest) {
  const { data: history } = await fetchHistoryData([body.ticker], body.startDate, body.endDate);
  ensureTickerHasData(body.ticker, history);
  return callEngineStrict('/api/engine/signal-analyze', {
    mode: 'single',
    single: body,
    priceData: history,
  });
}

/**
 * 双信号分析（含数据获取）。
 *
 * @throws {DataNotFoundError} 无价格数据
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function executeDualSignalAnalyze(body: DualSignalConfig) {
  const { signal1: cfg1, signal2: cfg2 } = body;
  const tickers = Array.from(new Set([cfg1.ticker, cfg2.ticker]));
  const { data: history } = await fetchHistoryData(tickers, cfg1.startDate, cfg1.endDate);
  ensurePriceDataExists([cfg1.ticker, cfg2.ticker], history, 'signal/dual');
  return callEngineStrict('/api/engine/signal-analyze', {
    mode: 'dual',
    dual: body,
    priceData: history,
  });
}

/**
 * 多信号分析（含数据获取）。
 *
 * @throws {DataNotFoundError} 无价格数据
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function executeMultiSignalAnalyze(body: MultiSignalConfig) {
  const { signals: configs } = body;
  const ticker = configs[0].ticker;
  const { data: history } = await fetchHistoryData(
    [ticker],
    configs[0].startDate,
    configs[0].endDate,
  );
  ensureTickerHasData(ticker, history, 'signal/multi');
  return callEngineStrict('/api/engine/signal-analyze', {
    mode: 'multi',
    multi: body,
    priceData: history,
  });
}
