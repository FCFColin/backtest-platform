/**
 * 测试夹具：价格数据与回测参数生成器
 *
 * 企业理由：portfolio、edge、coverage、adversarial、consistency、rust-engine
 * 等多个测试文件重复定义相同的价格数据生成函数和参数构造函数。
 * 本模块集中维护这些夹具，消除跨文件复制粘贴，确保行为一致。
 *
 * 注意：函数签名与原始测试文件完全一致，返回 Record<string, number>
 * （日期 -> 价格 映射），而非 PriceData[]。调用方负责将其组装为 PriceData 对象。
 */
import type { BacktestParameters } from '../../shared/types.js';

/**
 * 构造简单的线性增长价格数据
 *
 * 按固定日收益率生成交易日（跳过周末）的价格序列。
 * 用于 portfolio、edge、coverage 等测试。
 *
 * @param ticker - 资产代码（保留用于调用方可读性，函数内部不使用）
 * @param startDate - 起始日期（ISO 格式，如 '2020-01-02'）
 * @param endDate - 结束日期（ISO 格式）
 * @param startPrice - 起始价格
 * @param dailyReturn - 每日收益率（小数，如 0.001 = 0.1%）
 * @returns 日期 -> 价格 的映射
 */
export function makeLinearPriceData(
  ticker: string,
  startDate: string,
  endDate: string,
  startPrice: number,
  dailyReturn: number,
): Record<string, number> {
  const prices: Record<string, number> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);
  let price = startPrice;
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
      price *= (1 + dailyReturn);
    }
    current.setDate(current.getDate() + 1);
  }
  return prices;
}

/**
 * makePriceData 是 makeLinearPriceData 的别名
 *
 * bughunt、engineConsistency、rust-engine 测试使用此名称。
 * 两者实现完全相同，通过别名消除重复。
 */
export const makePriceData = makeLinearPriceData;

/**
 * 构造带波动的价格数据（按指定收益率序列）
 *
 * 用于模拟暴涨、暴跌、退市等非线性场景。
 * 收益率序列用尽后停止生成（即使日期范围未结束）。
 *
 * @param ticker - 资产代码（保留用于调用方可读性，函数内部不使用）
 * @param startDate - 起始日期（ISO 格式）
 * @param endDate - 结束日期（ISO 格式）
 * @param startPrice - 起始价格
 * @param returns - 每日收益率序列（小数，如 0.01 = 1%，-1.0 = 跌100%）
 * @returns 日期 -> 价格 的映射
 */
export function makeVolatilePriceData(
  ticker: string,
  startDate: string,
  endDate: string,
  startPrice: number,
  returns: number[],
): Record<string, number> {
  const prices: Record<string, number> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);
  let price = startPrice;
  let ri = 0;
  while (current <= end && ri < returns.length) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
      price *= (1 + returns[ri]);
      ri++;
    }
    current.setDate(current.getDate() + 1);
  }
  return prices;
}

/**
 * 构造回测参数（带默认值）
 *
 * 默认：2020-01-02 ~ 2020-12-31，初始资金 10000，不调整通胀，
 * 滚动窗口 12 个月，无基准。可通过 overrides 覆盖任意字段。
 *
 * @param overrides - 覆盖默认参数的字段
 * @returns 完整的 BacktestParameters 对象
 */
export function makeParams(overrides?: Partial<BacktestParameters>): BacktestParameters {
  return {
    startDate: '2020-01-02',
    endDate: '2020-12-31',
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    ...overrides,
  };
}
