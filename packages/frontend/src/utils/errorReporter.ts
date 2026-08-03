import type { ReactNode } from 'react';
import { useToastStore } from '../store/toastStore.js';
import i18n from '../i18n/index.js';

export type ReportType =
  'error' | 'vital' | 'api_timing' | 'component_render' | 'page_timing' | 'navigation';

export interface ErrorContext {
  component?: string;
  action?: string;
  jobId?: string;
  [key: string]: unknown;
}

const ERROR_REPORT_ENDPOINT = '/api/v1/errors';

function sendReport(type: ReportType, payload: Record<string, unknown>): void {
  fetch(ERROR_REPORT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      ...payload,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    }),
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
  sendReport('error', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  });
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

const ERROR_I18N_GROUPS: Record<string, string[]> = {
  'errors.unauthorized': [
    'UNAUTHORIZED',
    'AUTH_REQUIRED',
    'MISSING_AUTH',
    'INVALID_TOKEN',
    'INVALID_CREDENTIALS',
    'INVALID_REFRESH_TOKEN',
    'SESSION_REVOKED',
  ],
  'errors.forbidden': ['FORBIDDEN', 'INSUFFICIENT_PERMISSION', 'NOT_A_MEMBER', 'ORG_INACTIVE'],
  'errors.notFound': ['NOT_FOUND', 'DATA_NOT_FOUND'],
  'errors.missingParams': [
    'MISSING_PARAMS',
    'MISSING_ORG_ID',
    'MISSING_TOKEN',
    'MISSING_EMAIL',
    'MISSING_REFRESH_TOKEN',
    'MISSING_REQUIRED_FIELD',
    'ID_INVALID',
  ],
  'errors.internalError': ['INTERNAL_ERROR', 'READINESS_CHECK_ERROR', 'METRICS_GENERATION_FAILED'],
  'errors.backtestFailed': [
    'BACKTEST_FAILED',
    'BACKTEST_ERROR',
    'CACHE_MISS',
    'BACKTEST_CACHE_MISS',
  ],
  'errors.tickerLimitExceeded': ['TICKER_LIMIT_EXCEEDED', 'TICKERS_LIMIT_EXCEEDED'],
  'errors.noActiveTenant': ['NO_ACTIVE_TENANT', 'TENANT_REQUIRED'],
};
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
  ACCOUNT_DISABLED: 'errors.accountDisabled',
  ACCOUNT_LOCKED: 'errors.accountLocked',
  RATE_LIMITED: 'errors.rateLimited',
  QUOTA_EXCEEDED: 'errors.quotaExceeded',
  NETWORK_ERROR: 'errors.networkError',
  TIMEOUT: 'errors.requestTimeout',
  INVALID_TICKER: 'errors.invalidTicker',
  INVALID_DATE_RANGE: 'errors.invalidDateRange',
  BACKTEST_FAILED: 'errors.backtestFailed',
  DATA_FETCH_FAILED: 'errors.dataFetchFailed',
  EMAIL_TAKEN: 'errors.emailTaken',
  USERNAME_TAKEN: 'errors.usernameTaken',
  REGISTER_FAILED: 'errors.registerFailed',
  BILLING_DISABLED: 'errors.billingDisabled',
  INVALID_COUNTRY: 'errors.invalidCountry',
  CPI_NOT_FOUND: 'errors.cpiNotFound',
  DATABASE_UNAVAILABLE: 'errors.databaseUnavailable',
  INVALID_API_KEY: 'errors.invalidApiKey',
  INVALID_IDEMPOTENCY_KEY: 'errors.idempotencyKeyInvalid',
  OPTIMIZER_BAD_REQUEST: 'errors.optimizerBadRequest',
  CALC_INVALID_TYPE: 'errors.analysisInvalidType',
  GRID_TOO_MANY_COMBINATIONS: 'errors.gridTooMany',
  GRID_BAD_REQUEST: 'errors.gridBadRequest',
  PORTFOLIO_NOT_FOUND: 'errors.portfolioNotFound',
  CONFIG_NOT_FOUND: 'errors.configNotFound',
  RUN_NOT_FOUND: 'errors.runNotFound',
  JOB_NOT_FOUND: 'errors.jobNotFound',
  API_KEY_NOT_FOUND: 'errors.apiKeyNotFound',
  ORG_NOT_FOUND: 'errors.orgNotFound',
  MEMBER_NOT_FOUND: 'errors.memberNotFound',
  LAST_OWNER: 'errors.lastOwner',
  MISSING_CREDENTIALS: 'errors.missingCredentials',
  INVALID_OR_EXPIRED_TOKEN: 'errors.invalidToken',
  PAYMENT_REQUIRED: 'errors.quotaExceeded',
  PORTFOLIO_WEIGHT_SUM: 'errors.invalidWeightSum',
  PCA_MIN_ASSETS: 'errors.pcaMinAssets',
};
for (const [key, codes] of Object.entries(ERROR_I18N_GROUPS)) {
  for (const code of codes) ERROR_I18N_MAP[code] = key;
}

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

const getI18nKey = (code?: string): string => (code && ERROR_I18N_MAP[code]) || 'errors.unknown';
export const getErrorI18nKey = getI18nKey;
export const getWarningI18nKey = getI18nKey;

export function getWarningInterpolationParams(warning: WarningInfo): Record<string, ReactNode> {
  const params: Record<string, ReactNode> = {};
  if (warning.tickers?.length) params.tickers = warning.tickers.join(', ');
  for (const k of ['requestedStart', 'requestedEnd', 'actualStart', 'actualEnd'] as const) {
    if (warning[k]) params[k] = warning[k];
  }
  return params;
}

export function processResponseWarnings(json: Record<string, unknown>): WarningInfo[] {
  const raw = json.warnings;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const warningsList: WarningInfo[] = [];
  for (const w of raw) {
    if (typeof w === 'string') {
      useToastStore.getState().addToast('warning', w);
    } else if (w && typeof w === 'object') {
      const warn = w as WarningInfo;
      warningsList.push(warn);
      const message = i18n.t(getWarningI18nKey(warn.code), getWarningInterpolationParams(warn));
      useToastStore
        .getState()
        .addToast('warning', warn.message ? `${message} - ${warn.message}` : message);
    }
  }
  return warningsList;
}
