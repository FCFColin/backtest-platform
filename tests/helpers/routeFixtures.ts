/**
 * 测试辅助:路由测试 mock 数据工厂
 *
 * 企业理由:3 个路由测试(tactical-routes / tactical-grid-routes / backtest-optimizer-routes)
 * 重复定义 createMockPriceData 工厂,各自硬编码天数与起始价。本模块通过参数化统一,
 * 消除重复,确保行为一致。
 *
 * 注意:createValidRequest 虽在 5 个薄路由测试(letf/pca/tactical-grid/goal-optimizer/
 * backtest-optimizer)中同名出现,但各自返回结构完全不同(对应不同 schema),属于
 * 命名重复而非代码重复,故不抽取。
 *
 * 用法:
 *   import { createMockPriceData } from '../helpers/routeFixtures.js';
 *   const priceData = createMockPriceData({ numDays: 30, startPrice: 301 });
 */

/** createMockPriceData 配置选项 */
export interface MockPriceDataOptions {
  /** 生成天数(默认 2)
   * 对应原 backtest-optimizer-routes(2 天)/tactical-routes(3 天)/tactical-grid-routes(30 天)
   */
  numDays?: number;
  /** 第 0 天起始价(默认 300),第 i 天价格为 startPrice + i */
  startPrice?: number;
  /** 标的 ticker(默认 'SPY') */
  ticker?: string;
}

/**
 * 构造 mock 价格数据 `{ ticker: { 'YYYY-MM-DD': price } }`
 *
 * 默认生成 SPY 2020-01-01..2020-01-02 两天数据,价格为 300/301。
 * 通过 opts 可调整天数、起始价与 ticker。
 *
 * 日期固定 '2020-01-DD' 模式(DD 从 01 递增到 numDays),与原 3 处实现保持一致。
 *
 * @param opts - 配置选项,见 MockPriceDataOptions
 * @returns `{ [ticker]: { [date]: price } }` 形式的 mock 数据
 */
export function createMockPriceData(
  opts: MockPriceDataOptions = {},
): Record<string, Record<string, number>> {
  const { numDays = 2, startPrice = 300, ticker = 'SPY' } = opts;
  const data: Record<string, Record<string, number>> = {};
  for (let i = 0; i < numDays; i++) {
    const day = String(i + 1).padStart(2, '0');
    data[`2020-01-${day}`] = startPrice + i;
  }
  return { [ticker]: data };
}
