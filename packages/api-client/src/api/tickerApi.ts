/**
 * TickerApi — 标的搜索与价格查询接口包装
 */

import { BaseApiClient } from '../client.js';
import { Configuration } from '../configuration.js';
import type { ApiResponse, PricePoint, TickerSearchResult } from '../types.js';

export class TickerApi extends BaseApiClient {
  constructor(config: Configuration = new Configuration()) {
    super({
      basePath: config.basePath,
      apiKey: config.apiKey,
      accessToken: config.accessToken,
    });
  }

  /**
   * GET /api/v1/tickers/search — 搜索可回测标的
   *
   * @param query - 搜索关键词（ticker 或名称）
   * @returns 匹配的标的列表
   */
  async searchTickers(query: string): Promise<TickerSearchResult[]> {
    const res = await this.request<ApiResponse<TickerSearchResult[]>>(
      'GET',
      '/tickers/search',
      undefined,
      { query },
    );
    return (res.data as TickerSearchResult[] | undefined) ?? [];
  }

  /**
   * GET /api/v1/prices/:ticker — 获取标的历史价格
   *
   * @param ticker - 标的代码
   * @param startDate - 起始日期（YYYY-MM-DD），可选
   * @param endDate - 结束日期（YYYY-MM-DD），可选
   * @returns 价格数据点列表
   */
  async getTickerPrices(
    ticker: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PricePoint[]> {
    const res = await this.request<ApiResponse<PricePoint[]>>(
      'GET',
      `/prices/${encodeURIComponent(ticker)}`,
      undefined,
      { startDate, endDate },
    );
    return (res.data as PricePoint[] | undefined) ?? [];
  }
}
