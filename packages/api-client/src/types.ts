/**
 * 类型聚合：re-export @backtest/shared 中的通用类型，并定义 SDK 专属响应类型。
 *
 * 从 @backtest/shared 的 re-export 均为 type-only，构建产物中会被擦除，
 * 运行时不依赖 @backtest/shared；仅用于向 SDK 消费方提供一致的类型入口。
 */

export type {
  Asset,
  BaseCurrency,
  BacktestParameters,
  BacktestResult,
  CashflowLeg,
  CashflowType,
  OneTimeCashflow,
  Portfolio,
  RebalanceBands,
  RebalanceFrequency,
  DrawdownPoint,
  DrawdownEpisode,
  TimeSeriesPoint,
} from '@backtest/shared';

/**
 * API 统一响应信封（对应 OpenAPI `SuccessResponse` / `ProblemDetail`）。
 * 成功：`{ success: true, data, degraded?, degradedWarning? }`；
 * 失败：`{ success: false, error: ProblemDetail }`（失败响应会先被包装为 BacktestApiError 抛出）。
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  degraded?: boolean;
  degradedWarning?: string;
  error?: ProblemDetail;
}

/** RFC 7807 Problem Detail 错误体 */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
  instance?: string;
}

/** 认证令牌对（登录 / 刷新接口返回的 data） */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** 当前用户资料（GET /auth/me 返回的 data） */
export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  orgId?: string;
  role?: string;
}

/** 异步回测任务状态（GET /backtest/runs/:jobId 返回的 data） */
export interface BacktestRunStatus {
  jobId: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  runId?: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 标的搜索结果项（GET /tickers/search 返回的 data 数组元素） */
export interface TickerSearchResult {
  ticker: string;
  name?: string;
  market?: string;
  exchange?: string;
}

/** 价格数据点（GET /prices/:ticker 返回的 data 数组元素） */
export interface PricePoint {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}
