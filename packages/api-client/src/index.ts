/**
 * @backtest/api-client 入口
 *
 * 当前为手写的轻量级客户端（BaseApiClient + 包装类）。
 * 待 openapi-generator-cli 接入后，此处将同时 re-export 生成的
 * typescript-fetch 客户端，对外公共 API 保持稳定。
 */

// 底层传输层
export { BaseApiClient } from './client.js';
export type {
  BaseApiClientOptions,
  HttpMethod,
  QueryParams,
  QueryValue,
  RequestOptions,
} from './client.js';

// 配置
export { Configuration } from './configuration.js';
export type { ConfigurationOptions } from './configuration.js';

// 错误
export { BacktestApiError } from './errors.js';
export type { BacktestApiErrorOptions } from './errors.js';

// API 包装类
export { BacktestApi } from './api/backtestApi.js';
export { TickerApi } from './api/tickerApi.js';
export { AuthApi } from './api/authApi.js';

// 类型（含从 @backtest/shared 的 re-export，type-only）
export * from './types.js';
