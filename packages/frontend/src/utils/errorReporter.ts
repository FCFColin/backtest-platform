import type { ReactNode } from 'react';
export type ReportType =
  'error' | 'vital' | 'api_timing' | 'component_render' | 'page_timing' | 'navigation';
export interface ErrorContext {
  component?: string;
  action?: string;
  jobId?: string;
  [key: string]: unknown;
}
const ERROR_REPORT_ENDPOINT = '/api/v1/errors';
let isReporting = false;
function getTraceId(): string | undefined {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const apiEntries = entries.filter((e) => e.name.includes('/api/'));
    if (apiEntries.length > 0) {
      return undefined;
    }
  } catch {
    // 资源条目不可用时静默跳过
  }
}
function sendReport(type: ReportType, payload: Record<string, unknown>): void {
  const body = {
    type,
    ...payload,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    traceId: getTraceId(),
  };
  fetch(ERROR_REPORT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
export function reportError(error: unknown, context: ErrorContext = {}): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- 开发环境直接输出到控制台
    console.error('[ErrorReporter]', {
      message: error instanceof Error ? error.message : String(error),
      context,
    });
    return;
  }
  if (isReporting) return;
  isReporting = true;
  try {
    sendReport('error', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
    });
  } finally {
    isReporting = false;
  }
}
export function reportPerformance(
  type: Extract<
    ReportType,
    'vital' | 'api_timing' | 'component_render' | 'page_timing' | 'navigation'
  >,
  data: Record<string, unknown>,
): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- 开发环境直接输出
    console.log(`[Performance/${type}]`, data);
    return;
  }
  sendReport(type, data);
}
const ERROR_I18N_MAP: Record<string, string> = {
  VALIDATION_ERROR: 'errors.validationError',
  ENGINE_UNAVAILABLE: 'errors.engineUnavailable',
  ENGINE_ERROR: 'errors.engineError',
  COMPUTE_TIMEOUT: 'errors.computeTimeout',
  DATA_DEGRADED: 'errors.dataDegraded',
  TICKER_NOT_FOUND: 'errors.tickerNotFound',
  TICKER_DATA_INSUFFICIENT: 'errors.tickerDataInsufficient',
  TICKER_DATA_FETCH_FAILED: 'errors.tickerDataFetchFailed',
  INVALID_WEIGHT_SUM: 'errors.invalidWeightSum',
  EMPTY_PORTFOLIO: 'errors.emptyPortfolio',
  DATE_RANGE_CLAMPED: 'warning.dateRangeClamped',
  UNAUTHORIZED: 'errors.unauthorized',
  AUTH_REQUIRED: 'errors.unauthorized',
  MISSING_AUTH: 'errors.unauthorized',
  MISSING_CREDENTIALS: 'errors.missingCredentials',
  INVALID_TOKEN: 'errors.unauthorized',
  SESSION_REVOKED: 'errors.sessionRevoked',
  ACCOUNT_DISABLED: 'errors.accountDisabled',
  ACCOUNT_LOCKED: 'errors.accountLocked',
  INVALID_CREDENTIALS: 'errors.unauthorized',
  FORBIDDEN: 'errors.forbidden',
  INSUFFICIENT_PERMISSION: 'errors.insufficientPermission',
  NOT_FOUND: 'errors.notFound',
  DATA_NOT_FOUND: 'errors.notFound',
  PORTFOLIO_NOT_FOUND: 'errors.portfolioNotFound',
  CONFIG_NOT_FOUND: 'errors.configNotFound',
  RUN_NOT_FOUND: 'errors.runNotFound',
  JOB_NOT_FOUND: 'errors.jobNotFound',
  API_KEY_NOT_FOUND: 'errors.apiKeyNotFound',
  ORG_NOT_FOUND: 'errors.orgNotFound',
  MEMBER_NOT_FOUND: 'errors.memberNotFound',
  LAST_OWNER: 'errors.lastOwner',
  RATE_LIMITED: 'errors.rateLimited',
  QUOTA_EXCEEDED: 'errors.quotaExceeded',
  INTERNAL_ERROR: 'errors.internalError',
  NETWORK_ERROR: 'errors.networkError',
  TIMEOUT: 'errors.requestTimeout',
  INVALID_TICKER: 'errors.invalidTicker',
  INVALID_DATE_RANGE: 'errors.invalidDateRange',
  MISSING_PARAMS: 'errors.missingParams',
  BACKTEST_FAILED: 'errors.backtestFailed',
  BACKTEST_ERROR: 'errors.backtestFailed',
  DATA_FETCH_FAILED: 'errors.dataFetchFailed',
  EMAIL_TAKEN: 'errors.emailTaken',
  USERNAME_TAKEN: 'errors.usernameTaken',
  REGISTER_FAILED: 'errors.registerFailed',
  BILLING_DISABLED: 'errors.billingDisabled',
  TICKER_LIMIT_EXCEEDED: 'errors.tickerLimitExceeded',
  INVALID_COUNTRY: 'errors.invalidCountry',
  CPI_NOT_FOUND: 'errors.cpiNotFound',
  DATABASE_UNAVAILABLE: 'errors.databaseUnavailable',
  NO_ACTIVE_TENANT: 'errors.noActiveTenant',
  INVALID_API_KEY: 'errors.invalidApiKey',
  INVALID_IDEMPOTENCY_KEY: 'errors.idempotencyKeyInvalid',
  OPTIMIZER_BAD_REQUEST: 'errors.optimizerBadRequest',
  CALC_INVALID_TYPE: 'errors.analysisInvalidType',
  GRID_TOO_MANY_COMBINATIONS: 'errors.gridTooMany',
  GRID_BAD_REQUEST: 'errors.gridBadRequest',
  TICKERS_LIMIT_EXCEEDED: 'errors.tickerLimitExceeded',
  TENANT_REQUIRED: 'errors.noActiveTenant',
  MISSING_ORG_ID: 'errors.missingParams',
  MISSING_TOKEN: 'errors.missingParams',
  MISSING_EMAIL: 'errors.missingParams',
  MISSING_REFRESH_TOKEN: 'errors.missingParams',
  INVALID_OR_EXPIRED_TOKEN: 'errors.invalidToken',
  INVALID_REFRESH_TOKEN: 'errors.unauthorized',
  NOT_A_MEMBER: 'errors.forbidden',
  ORG_INACTIVE: 'errors.forbidden',
  READINESS_CHECK_ERROR: 'errors.internalError',
  METRICS_GENERATION_FAILED: 'errors.internalError',
  CACHE_MISS: 'errors.backtestFailed',
  BACKTEST_CACHE_MISS: 'errors.backtestFailed',
  MISSING_REQUIRED_FIELD: 'errors.missingParams',
  PAYMENT_REQUIRED: 'errors.quotaExceeded',
  ID_INVALID: 'errors.missingParams',
  PORTFOLIO_WEIGHT_SUM: 'errors.invalidWeightSum',
  PCA_MIN_ASSETS: 'errors.pcaMinAssets',
};
export interface ApiError {
  code?: string;
  message?: string;
  detail?: string;
  [key: string]: unknown;
}
export interface WarningInfo {
  code?: string;
  message?: string;
  tickers?: string[];
  requestedStart?: string;
  requestedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
}
export function getErrorI18nKey(code?: string): string {
  if (!code) return 'errors.unknown';
  return ERROR_I18N_MAP[code] || 'errors.unknown';
}
export function getWarningI18nKey(code?: string): string {
  if (!code) return 'errors.unknown';
  return ERROR_I18N_MAP[code] || 'errors.unknown';
}
export function getWarningInterpolationParams(warning: WarningInfo): Record<string, ReactNode> {
  const params: Record<string, ReactNode> = {};
  if (warning.tickers && warning.tickers.length > 0) {
    params.tickers = warning.tickers.join(', ');
  }
  if (warning.requestedStart) params.requestedStart = warning.requestedStart;
  if (warning.requestedEnd) params.requestedEnd = warning.requestedEnd;
  if (warning.actualStart) params.actualStart = warning.actualStart;
  if (warning.actualEnd) params.actualEnd = warning.actualEnd;
  return params;
}
