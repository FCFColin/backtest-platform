import type { ReactNode } from 'react';

const ERROR_I18N_MAP: Record<string, string> = {
  VALIDATION_ERROR: 'error.validationError',
  ENGINE_UNAVAILABLE: 'error.engineUnavailable',
  ENGINE_ERROR: 'error.engineError',
  COMPUTE_TIMEOUT: 'error.computeTimeout',
  DATA_DEGRADED: 'error.dataDegraded',
  TICKER_NOT_FOUND: 'error.tickerNotFound',
  TICKER_DATA_INSUFFICIENT: 'error.tickerDataInsufficient',
  TICKER_DATA_FETCH_FAILED: 'error.tickerDataFetchFailed',
  INVALID_WEIGHT_SUM: 'error.invalidWeightSum',
  EMPTY_PORTFOLIO: 'error.emptyPortfolio',
  DATE_RANGE_CLAMPED: 'warning.dateRangeClamped',
  UNAUTHORIZED: 'error.unauthorized',
  AUTH_REQUIRED: 'error.unauthorized',
  MISSING_AUTH: 'error.unauthorized',
  MISSING_CREDENTIALS: 'error.missingCredentials',
  INVALID_TOKEN: 'error.unauthorized',
  SESSION_REVOKED: 'error.sessionRevoked',
  ACCOUNT_DISABLED: 'error.accountDisabled',
  ACCOUNT_LOCKED: 'error.accountLocked',
  INVALID_CREDENTIALS: 'error.unauthorized',
  FORBIDDEN: 'error.forbidden',
  INSUFFICIENT_PERMISSION: 'error.insufficientPermission',
  NOT_FOUND: 'error.notFound',
  DATA_NOT_FOUND: 'error.notFound',
  PORTFOLIO_NOT_FOUND: 'error.portfolioNotFound',
  CONFIG_NOT_FOUND: 'error.configNotFound',
  RUN_NOT_FOUND: 'error.runNotFound',
  JOB_NOT_FOUND: 'error.jobNotFound',
  API_KEY_NOT_FOUND: 'error.apiKeyNotFound',
  ORG_NOT_FOUND: 'error.orgNotFound',
  MEMBER_NOT_FOUND: 'error.memberNotFound',
  LAST_OWNER: 'error.lastOwner',
  RATE_LIMITED: 'error.rateLimited',
  QUOTA_EXCEEDED: 'error.quotaExceeded',
  INTERNAL_ERROR: 'error.internalError',
  NETWORK_ERROR: 'error.networkError',
  TIMEOUT: 'error.requestTimeout',
  INVALID_TICKER: 'error.invalidTicker',
  INVALID_DATE_RANGE: 'error.invalidDateRange',
  MISSING_PARAMS: 'error.missingParams',
  BACKTEST_FAILED: 'error.backtestFailed',
  BACKTEST_ERROR: 'error.backtestFailed',
  DATA_FETCH_FAILED: 'error.dataFetchFailed',
  EMAIL_TAKEN: 'error.emailTaken',
  USERNAME_TAKEN: 'error.usernameTaken',
  REGISTER_FAILED: 'error.registerFailed',
  BILLING_DISABLED: 'error.billingDisabled',
  TICKER_LIMIT_EXCEEDED: 'error.tickerLimitExceeded',
  INVALID_COUNTRY: 'error.invalidCountry',
  CPI_NOT_FOUND: 'error.cpiNotFound',
  DATABASE_UNAVAILABLE: 'error.databaseUnavailable',
  NO_ACTIVE_TENANT: 'error.noActiveTenant',
  INVALID_API_KEY: 'error.invalidApiKey',
  INVALID_IDEMPOTENCY_KEY: 'error.idempotencyKeyInvalid',
  OPTIMIZER_BAD_REQUEST: 'error.optimizerBadRequest',
  CALC_INVALID_TYPE: 'error.analysisInvalidType',
  GRID_TOO_MANY_COMBINATIONS: 'error.gridTooMany',
  GRID_BAD_REQUEST: 'error.gridBadRequest',
  TICKERS_LIMIT_EXCEEDED: 'error.tickerLimitExceeded',
  TENANT_REQUIRED: 'error.noActiveTenant',
  MISSING_ORG_ID: 'error.missingParams',
  MISSING_TOKEN: 'error.missingParams',
  MISSING_EMAIL: 'error.missingParams',
  MISSING_REFRESH_TOKEN: 'error.missingParams',
  INVALID_OR_EXPIRED_TOKEN: 'error.invalidToken',
  INVALID_REFRESH_TOKEN: 'error.unauthorized',
  NOT_A_MEMBER: 'error.forbidden',
  ORG_INACTIVE: 'error.forbidden',
  READINESS_CHECK_ERROR: 'error.internalError',
  METRICS_GENERATION_FAILED: 'error.internalError',
  CACHE_MISS: 'error.backtestFailed',
  BACKTEST_CACHE_MISS: 'error.backtestFailed',
  MISSING_REQUIRED_FIELD: 'error.missingParams',
  PAYMENT_REQUIRED: 'error.quotaExceeded',
  ID_INVALID: 'error.missingParams',
  PORTFOLIO_WEIGHT_SUM: 'error.invalidWeightSum',
  PCA_MIN_ASSETS: 'error.pcaMinAssets',
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
  if (!code) return 'error.unknown';
  return ERROR_I18N_MAP[code] || 'error.unknown';
}

export function getWarningI18nKey(code?: string): string {
  if (!code) return 'error.unknown';
  return ERROR_I18N_MAP[code] || 'error.unknown';
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
