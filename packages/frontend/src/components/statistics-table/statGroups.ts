/**
 * @file StatisticsTable 分组定义
 * @description 完整模式与概览（compact）模式下的统计指标分组数据。
 *   纯数据导出，不含渲染逻辑；由 StatisticsGroupRows 统一渲染。
 */
import type { StatGroup, StatRow } from './types.js';

/** 层级模式：回测结果页面使用的主次分明指标配置 */
export const HIERARCHICAL_METRICS: StatRow[] = [
  { key: 'totalReturn', label: 'stats.totalReturn', fmt: 'pct', importance: 'primary', higherIsBetter: true },
  { key: 'cagr', label: 'stats.cagr', fmt: 'pct', importance: 'primary', higherIsBetter: true },
  { key: 'maxDrawdown', label: 'stats.maxDrawdown', fmt: 'pct', importance: 'primary', higherIsBetter: false },
  { key: 'sharpe', label: 'stats.sharpe', fmt: 'num', importance: 'primary', higherIsBetter: true },
  { key: 'stdev', label: 'stats.stdev', fmt: 'pct', importance: 'secondary', higherIsBetter: false },
  { key: 'sortino', label: 'stats.sortino', fmt: 'num', importance: 'secondary', higherIsBetter: true },
  { key: 'calmar', label: 'stats.calmar', fmt: 'num', importance: 'secondary', higherIsBetter: true },
  { key: 'pctPositiveMonths', label: 'stats.pctPositiveMonths', fmt: 'pct', importance: 'secondary', higherIsBetter: true },
  { key: 'maxMonthlyReturn', label: 'stats.maxMonthlyReturn', fmt: 'pct', importance: 'secondary', higherIsBetter: true },
  { key: 'minMonthlyReturn', label: 'stats.minMonthlyReturn', fmt: 'pct', importance: 'secondary', higherIsBetter: false },
  { key: 'varMonthly5', label: 'stats.varMonthly5', fmt: 'pct', importance: 'detailed', higherIsBetter: false },
  { key: 'cvarMonthly5', label: 'stats.cvarMonthly5', fmt: 'pct', importance: 'detailed', higherIsBetter: false },
  { key: 'minDailyReturn', label: 'stats.minDailyReturn', fmt: 'pct', importance: 'detailed', higherIsBetter: false },
  { key: 'avgDrawdown', label: 'stats.avgDrawdown', fmt: 'pct', importance: 'detailed', higherIsBetter: false },
  { key: 'maxDrawdownDuration', label: 'stats.maxDrawdownDuration', fmt: 'int', importance: 'detailed', higherIsBetter: false },
];

/** 完整模式：覆盖全部统计指标分组 */
export const STAT_GROUPS: StatGroup[] = [
  {
    title: 'components.statisticsTable.groups.return',
    rows: [
      { key: 'cagr', label: 'stats.cagr', fmt: 'pct' },
      { key: 'mwrr', label: 'stats.mwrr', fmt: 'pct' },
      { key: 'totalReturn', label: 'stats.totalReturn', fmt: 'pct' },
      { key: 'avgAnnualReturn', label: 'stats.avgAnnualReturn', fmt: 'pct' },
      { key: 'avgMonthlyReturn', label: 'stats.avgMonthlyReturn', fmt: 'pct' },
      { key: 'avgDailyReturn', label: 'stats.avgDailyReturn', fmt: 'pct' },
      { key: 'avgYear', label: 'stats.avgYear', fmt: 'pct' },
      { key: 'bestYear', label: 'stats.bestYear', fmt: 'pct' },
      { key: 'worstYear', label: 'stats.worstYear', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.volatility',
    rows: [
      { key: 'stdev', label: 'stats.stdev', fmt: 'pct' },
      { key: 'stdevAnnual', label: 'stats.stdevAnnual', fmt: 'pct' },
      { key: 'stdevMonthly', label: 'stats.stdevMonthly', fmt: 'pct' },
      { key: 'stdevMonthlyRaw', label: 'stats.stdevMonthlyRaw', fmt: 'pct' },
      { key: 'stdevDaily', label: 'stats.stdevDaily', fmt: 'pct' },
      { key: 'stdevDailyRaw', label: 'stats.stdevDailyRaw', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.downsideDeviation',
    rows: [
      { key: 'downsideDeviation', label: 'stats.downsideDeviation', fmt: 'pct' },
      { key: 'downsideDeviationAnnual', label: 'stats.downsideDeviationAnnual', fmt: 'pct' },
      { key: 'downsideDeviationMonthly', label: 'stats.downsideDeviationMonthly', fmt: 'pct' },
      { key: 'downsideDeviationMonthlyRaw', label: 'stats.downsideDeviationMonthlyRaw', fmt: 'pct' },
      { key: 'downsideDeviationDailyRaw', label: 'stats.downsideDeviationDailyRaw', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.drawdown',
    rows: [
      { key: 'maxDrawdown', label: 'stats.maxDrawdown', fmt: 'pct' },
      { key: 'avgDrawdown', label: 'stats.avgDrawdown', fmt: 'pct' },
      { key: 'maxDrawdownDuration', label: 'stats.maxDrawdownDuration', fmt: 'int' },
      { key: 'drawdownRecoveryFactor', label: 'stats.drawdownRecoveryFactor', fmt: 'num' },
      { key: 'ulcerIndex', label: 'stats.ulcerIndex', fmt: 'num' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.riskAdjusted',
    rows: [
      { key: 'sharpe', label: 'stats.sharpe', fmt: 'num' },
      { key: 'sortino', label: 'stats.sortino', fmt: 'num' },
      { key: 'calmar', label: 'stats.calmar', fmt: 'num' },
      { key: 'm2', label: 'stats.m2', fmt: 'pct' },
      { key: 'ulcerPerformanceIndex', label: 'stats.ulcerPerformanceIndex', fmt: 'num' },
      { key: 'treynor', label: 'stats.treynor', fmt: 'num' },
      { key: 'diversificationRatio', label: 'stats.diversificationRatio', fmt: 'num' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.benchmark',
    rows: [
      { key: 'beta', label: 'stats.beta', fmt: 'num' },
      { key: 'alpha', label: 'stats.alpha', fmt: 'num' },
      { key: 'alphaDaily', label: 'stats.alphaDaily', fmt: 'pct' },
      { key: 'alphaAnnualized', label: 'stats.alphaAnnualized', fmt: 'pct' },
      { key: 'rSquared', label: 'stats.rSquared', fmt: 'num' },
      { key: 'benchmarkCorrelation', label: 'stats.benchmarkCorrelation', fmt: 'num' },
      { key: 'upsideCorrelation', label: 'stats.upsideCorrelation', fmt: 'num' },
      { key: 'downsideCorrelation', label: 'stats.downsideCorrelation', fmt: 'num' },
      { key: 'upsideBeta', label: 'stats.upsideBeta', fmt: 'num' },
      { key: 'downsideBeta', label: 'stats.downsideBeta', fmt: 'num' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.captureRatio',
    rows: [
      { key: 'upsideCapture', label: 'stats.upsideCapture', fmt: 'pct' },
      { key: 'downsideCapture', label: 'stats.downsideCapture', fmt: 'pct' },
      { key: 'captureSpread', label: 'stats.captureSpread', fmt: 'pct' },
      { key: 'upsideCaptureAnnual', label: 'stats.upsideCaptureAnnual', fmt: 'pct' },
      { key: 'downsideCaptureAnnual', label: 'stats.downsideCaptureAnnual', fmt: 'pct' },
      { key: 'captureSpreadAnnual', label: 'stats.captureSpreadAnnual', fmt: 'pct' },
      { key: 'upsideCaptureDaily', label: 'stats.upsideCaptureDaily', fmt: 'pct' },
      { key: 'downsideCaptureDaily', label: 'stats.downsideCaptureDaily', fmt: 'pct' },
      { key: 'captureSpreadDaily', label: 'stats.captureSpreadDaily', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.activeManagement',
    rows: [
      { key: 'activeReturn', label: 'stats.activeReturn', fmt: 'pct' },
      { key: 'trackingError', label: 'stats.trackingError', fmt: 'pct' },
      { key: 'informationRatio', label: 'stats.informationRatio', fmt: 'num' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.varCvar',
    rows: [
      { key: 'varDaily1', label: 'stats.varDaily1', fmt: 'pct' },
      { key: 'varDaily5', label: 'stats.varDaily5', fmt: 'pct' },
      { key: 'varDaily10', label: 'stats.varDaily10', fmt: 'pct' },
      { key: 'cvarDaily1', label: 'stats.cvarDaily1', fmt: 'pct' },
      { key: 'cvarDaily5', label: 'stats.cvarDaily5', fmt: 'pct' },
      { key: 'cvarDaily10', label: 'stats.cvarDaily10', fmt: 'pct' },
      { key: 'varMonthly1', label: 'stats.varMonthly1', fmt: 'pct' },
      { key: 'varMonthly5', label: 'stats.varMonthly5', fmt: 'pct' },
      { key: 'varMonthly10', label: 'stats.varMonthly10', fmt: 'pct' },
      { key: 'cvarMonthly1', label: 'stats.cvarMonthly1', fmt: 'pct' },
      { key: 'cvarMonthly5', label: 'stats.cvarMonthly5', fmt: 'pct' },
      { key: 'cvarMonthly10', label: 'stats.cvarMonthly10', fmt: 'pct' },
      { key: 'varAnnual1', label: 'stats.varAnnual1', fmt: 'pct' },
      { key: 'varAnnual5', label: 'stats.varAnnual5', fmt: 'pct' },
      { key: 'varAnnual10', label: 'stats.varAnnual10', fmt: 'pct' },
      { key: 'cvarAnnual1', label: 'stats.cvarAnnual1', fmt: 'pct' },
      { key: 'cvarAnnual5', label: 'stats.cvarAnnual5', fmt: 'pct' },
      { key: 'cvarAnnual10', label: 'stats.cvarAnnual10', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.distribution',
    rows: [
      { key: 'skewnessDaily', label: 'stats.skewnessDaily', fmt: 'num' },
      { key: 'skewnessMonthly', label: 'stats.skewnessMonthly', fmt: 'num' },
      { key: 'skewnessAnnual', label: 'stats.skewnessAnnual', fmt: 'num' },
      { key: 'excessKurtosisDaily', label: 'stats.excessKurtosisDaily', fmt: 'num' },
      { key: 'excessKurtosisMonthly', label: 'stats.excessKurtosisMonthly', fmt: 'num' },
      { key: 'excessKurtosisAnnual', label: 'stats.excessKurtosisAnnual', fmt: 'num' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.positiveRatio',
    rows: [
      { key: 'pctPositiveDays', label: 'stats.pctPositiveDays', fmt: 'pct' },
      { key: 'pctPositiveMonths', label: 'stats.pctPositiveMonths', fmt: 'pct' },
      { key: 'pctPositiveYears', label: 'stats.pctPositiveYears', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.extremeReturns',
    rows: [
      { key: 'maxDailyReturn', label: 'stats.maxDailyReturn', fmt: 'pct' },
      { key: 'minDailyReturn', label: 'stats.minDailyReturn', fmt: 'pct' },
      { key: 'maxMonthlyReturn', label: 'stats.maxMonthlyReturn', fmt: 'pct' },
      { key: 'minMonthlyReturn', label: 'stats.minMonthlyReturn', fmt: 'pct' },
      { key: 'maxAnnualReturn', label: 'stats.maxAnnualReturn', fmt: 'pct' },
      { key: 'minAnnualReturn', label: 'stats.minAnnualReturn', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.avgGainLoss',
    rows: [
      { key: 'avgDailyGain', label: 'stats.avgDailyGain', fmt: 'pct' },
      { key: 'avgDailyLoss', label: 'stats.avgDailyLoss', fmt: 'pct' },
      { key: 'gainLossRatioDaily', label: 'stats.gainLossRatioDaily', fmt: 'num' },
      { key: 'avgMonthlyGain', label: 'stats.avgMonthlyGain', fmt: 'pct' },
      { key: 'avgMonthlyLoss', label: 'stats.avgMonthlyLoss', fmt: 'pct' },
      { key: 'gainLossRatioMonthly', label: 'stats.gainLossRatioMonthly', fmt: 'num' },
      { key: 'avgAnnualGain', label: 'stats.avgAnnualGain', fmt: 'pct' },
      { key: 'avgAnnualLoss', label: 'stats.avgAnnualLoss', fmt: 'pct' },
      { key: 'gainLossRatioAnnual', label: 'stats.gainLossRatioAnnual', fmt: 'num' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.withdrawalRate',
    rows: [
      { key: 'swr', label: 'stats.swr', fmt: 'pct' },
      { key: 'pwr', label: 'stats.pwr', fmt: 'pct' },
      { key: 'swr10y', label: 'stats.swr10y', fmt: 'pct' },
      { key: 'pwr10y', label: 'stats.pwr10y', fmt: 'pct' },
      { key: 'swr20y', label: 'stats.swr20y', fmt: 'pct' },
      { key: 'pwr20y', label: 'stats.pwr20y', fmt: 'pct' },
      { key: 'swr30y', label: 'stats.swr30y', fmt: 'pct' },
      { key: 'pwr30y', label: 'stats.pwr30y', fmt: 'pct' },
      { key: 'swr40y', label: 'stats.swr40y', fmt: 'pct' },
      { key: 'pwr40y', label: 'stats.pwr40y', fmt: 'pct' },
    ],
  },
];

/** 概览模式：只显示核心指标 */
export const COMPACT_GROUPS: StatGroup[] = [
  {
    title: 'components.statisticsTable.groups.core',
    rows: [
      { key: 'cagr', label: 'stats.cagr', fmt: 'pct' },
      { key: 'totalReturn', label: 'stats.totalReturn', fmt: 'pct' },
      { key: 'stdev', label: 'stats.stdev', fmt: 'pct' },
      { key: 'sharpe', label: 'stats.sharpe', fmt: 'num' },
      { key: 'sortino', label: 'stats.sortino', fmt: 'num' },
      { key: 'calmar', label: 'stats.calmar', fmt: 'num' },
      { key: 'maxDrawdown', label: 'stats.maxDrawdown', fmt: 'pct' },
      { key: 'avgDrawdown', label: 'stats.avgDrawdown', fmt: 'pct' },
      { key: 'maxDrawdownDuration', label: 'stats.maxDrawdownDuration', fmt: 'int' },
      { key: 'ulcerIndex', label: 'stats.ulcerIndex', fmt: 'num' },
      { key: 'diversificationRatio', label: 'stats.diversificationRatio', fmt: 'num' },
      { key: 'beta', label: 'stats.beta', fmt: 'num' },
      { key: 'alpha', label: 'stats.alpha', fmt: 'num' },
      { key: 'rSquared', label: 'stats.rSquared', fmt: 'num' },
      { key: 'informationRatio', label: 'stats.informationRatio', fmt: 'num' },
      { key: 'pctPositiveYears', label: 'stats.pctPositiveYears', fmt: 'pct' },
      { key: 'bestYear', label: 'stats.bestYear', fmt: 'pct' },
      { key: 'worstYear', label: 'stats.worstYear', fmt: 'pct' },
      { key: 'swr30y', label: 'stats.swr30y', fmt: 'pct' },
      { key: 'pwr30y', label: 'stats.pwr30y', fmt: 'pct' },
    ],
  },
];
