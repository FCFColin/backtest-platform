/**
 * BacktestApi — 回测相关接口包装
 *
 * 所有方法对应 OpenAPI spec 中 `backtest` tag 下的端点，
 * basePath 已含 `/api/v1`，故路径写作 `/backtest/...`。
 */

import { BaseApiClient } from '../client.js';
import { Configuration } from '../configuration.js';
import type {
  ApiResponse,
  BacktestParameters,
  BacktestResult,
  BacktestRunStatus,
  Portfolio,
} from '../types.js';

export class BacktestApi extends BaseApiClient {
  constructor(config: Configuration = new Configuration()) {
    super({
      basePath: config.basePath,
      apiKey: config.apiKey,
      accessToken: config.accessToken,
    });
  }

  /**
   * POST /api/v1/backtest/portfolio — 组合回测
   *
   * @param portfolio - 单个组合定义
   * @param options - 回测参数（startDate/endDate/startingValue 等）
   * @returns 完整回测结果（含增长曲线、统计、回撤等）
   */
  async runBacktest(portfolio: Portfolio, options: BacktestParameters): Promise<BacktestResult> {
    const res = await this.request<ApiResponse<BacktestResult>>('POST', '/backtest/portfolio', {
      portfolios: [portfolio],
      parameters: options,
    });
    return res.data as BacktestResult;
  }

  /**
   * GET /api/v1/backtest/runs/:jobId — 查询异步回测任务状态
   *
   * @param jobId - 异步任务 ID
   * @returns 任务状态（pending/running/completed/failed 及进度）
   */
  async getBacktestRun(jobId: string): Promise<BacktestRunStatus> {
    const res = await this.request<ApiResponse<BacktestRunStatus>>(
      'GET',
      `/backtest/runs/${encodeURIComponent(jobId)}`,
    );
    return res.data as BacktestRunStatus;
  }

  /**
   * GET /api/v1/backtest/results/:runId — 获取已完成的回测结果
   *
   * @param runId - 回测运行 ID（任务完成后获得）
   * @returns 完整回测结果
   */
  async getBacktestResults(runId: string): Promise<BacktestResult> {
    const res = await this.request<ApiResponse<BacktestResult>>(
      'GET',
      `/backtest/results/${encodeURIComponent(runId)}`,
    );
    return res.data as BacktestResult;
  }
}
