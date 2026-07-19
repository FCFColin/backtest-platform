/**
 * @file StatisticsTable 分组定义
 * @description 完整模式与概览（compact）模式下的统计指标分组数据。
 *   纯数据导出，不含渲染逻辑；由 StatisticsGroupRows 统一渲染。
 */
import type { StatGroup } from './types.js';

/** 完整模式：覆盖全部统计指标分组 */
export const STAT_GROUPS: StatGroup[] = [
  {
    title: 'components.statisticsTable.groups.return',
    rows: [
      { key: 'cagr', label: 'backtest.cagr', fmt: 'pct' },
      {
        key: 'avgAnnualReturn',
        label: 'components.statisticsTable.labels.avgAnnualReturn',
        fmt: 'pct',
      },
      {
        key: 'avgMonthlyReturn',
        label: 'components.statisticsTable.labels.avgMonthlyReturn',
        fmt: 'pct',
      },
      {
        key: 'avgDailyReturn',
        label: 'components.statisticsTable.labels.avgDailyReturn',
        fmt: 'pct',
      },
      { key: 'bestYear', label: 'components.statisticsTable.labels.bestYear', fmt: 'pct' },
      { key: 'worstYear', label: 'components.statisticsTable.labels.worstYear', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.volatility',
    rows: [
      { key: 'stdev', label: 'components.statisticsTable.labels.stdevAnnualized', fmt: 'pct' },
      { key: 'stdevAnnual', label: 'components.statisticsTable.labels.stdevAnnual', fmt: 'pct' },
      {
        key: 'stdevMonthly',
        label: 'components.statisticsTable.labels.stdevMonthlyAnnualized',
        fmt: 'pct',
      },
      {
        key: 'stdevMonthlyRaw',
        label: 'components.statisticsTable.labels.stdevMonthlyRaw',
        fmt: 'pct',
      },
      {
        key: 'stdevDaily',
        label: 'components.statisticsTable.labels.stdevDailyAnnualized',
        fmt: 'pct',
      },
      {
        key: 'stdevDailyRaw',
        label: 'components.statisticsTable.labels.stdevDailyRaw',
        fmt: 'pct',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.downsideDeviation',
    rows: [
      {
        key: 'downsideDeviation',
        label: 'components.statisticsTable.labels.downsideDeviationAnnualized',
        fmt: 'pct',
      },
      {
        key: 'downsideDeviationDailyRaw',
        label: 'components.statisticsTable.labels.downsideDeviationDailyRaw',
        fmt: 'pct',
      },
      {
        key: 'downsideDeviationMonthly',
        label: 'components.statisticsTable.labels.downsideDeviationMonthly',
        fmt: 'pct',
      },
      {
        key: 'downsideDeviationMonthlyRaw',
        label: 'components.statisticsTable.labels.downsideDeviationMonthlyRaw',
        fmt: 'pct',
      },
      {
        key: 'downsideDeviationAnnual',
        label: 'components.statisticsTable.labels.downsideDeviationAnnual',
        fmt: 'pct',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.drawdown',
    rows: [
      { key: 'maxDrawdown', label: 'backtest.maxDrawdown', fmt: 'pct' },
      { key: 'avgDrawdown', label: 'components.statisticsTable.labels.avgDrawdown', fmt: 'pct' },
      {
        key: 'maxDrawdownDuration',
        label: 'components.statisticsTable.labels.maxDrawdownDuration',
        fmt: 'duration',
      },
      {
        key: 'drawdownRecoveryFactor',
        label: 'components.statisticsTable.labels.drawdownRecoveryFactor',
        fmt: 'ratio',
      },
      { key: 'ulcerIndex', label: 'components.statisticsTable.labels.ulcerIndex', fmt: 'ratio' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.riskAdjusted',
    rows: [
      { key: 'sharpe', label: 'backtest.sharpeRatio', fmt: 'ratio' },
      { key: 'sortino', label: 'backtest.sortino', fmt: 'ratio' },
      { key: 'calmar', label: 'backtest.calmar', fmt: 'ratio' },
      { key: 'm2', label: 'components.statisticsTable.labels.m2', fmt: 'pct' },
      {
        key: 'ulcerPerformanceIndex',
        label: 'components.statisticsTable.labels.ulcerPerformanceIndex',
        fmt: 'ratio',
      },
      {
        key: 'diversificationRatio',
        label: 'components.statisticsTable.labels.diversificationRatio',
        fmt: 'ratio',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.benchmark',
    rows: [
      {
        key: 'benchmarkCorrelation',
        label: 'components.statisticsTable.labels.benchmarkCorrelation',
        fmt: 'ratio',
      },
      { key: 'beta', label: 'Beta', fmt: 'ratio' },
      {
        key: 'upsideCorrelation',
        label: 'components.statisticsTable.labels.upsideCorrelation',
        fmt: 'ratio',
      },
      {
        key: 'downsideCorrelation',
        label: 'components.statisticsTable.labels.downsideCorrelation',
        fmt: 'ratio',
      },
      { key: 'upsideBeta', label: 'components.statisticsTable.labels.upsideBeta', fmt: 'ratio' },
      {
        key: 'downsideBeta',
        label: 'components.statisticsTable.labels.downsideBeta',
        fmt: 'ratio',
      },
      { key: 'alphaDaily', label: 'components.statisticsTable.labels.alphaDaily', fmt: 'pct' },
      {
        key: 'alphaAnnualized',
        label: 'components.statisticsTable.labels.alphaAnnualized',
        fmt: 'pct',
      },
      { key: 'alpha', label: 'Alpha (Jensen)', fmt: 'pct' },
      { key: 'rSquared', label: 'R\u00B2', fmt: 'ratio' },
      { key: 'treynor', label: 'components.statisticsTable.labels.treynor', fmt: 'ratio' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.captureRatio',
    rows: [
      {
        key: 'upsideCapture',
        label: 'components.statisticsTable.labels.upsideCapture',
        fmt: 'pct',
      },
      {
        key: 'downsideCapture',
        label: 'components.statisticsTable.labels.downsideCapture',
        fmt: 'pct',
      },
      {
        key: 'captureSpread',
        label: 'components.statisticsTable.labels.captureSpread',
        fmt: 'pct',
      },
      {
        key: 'upsideCaptureDaily',
        label: 'components.statisticsTable.labels.upsideCaptureDaily',
        fmt: 'pct',
      },
      {
        key: 'downsideCaptureDaily',
        label: 'components.statisticsTable.labels.downsideCaptureDaily',
        fmt: 'pct',
      },
      {
        key: 'captureSpreadDaily',
        label: 'components.statisticsTable.labels.captureSpreadDaily',
        fmt: 'pct',
      },
      {
        key: 'upsideCaptureAnnual',
        label: 'components.statisticsTable.labels.upsideCaptureAnnual',
        fmt: 'pct',
      },
      {
        key: 'downsideCaptureAnnual',
        label: 'components.statisticsTable.labels.downsideCaptureAnnual',
        fmt: 'pct',
      },
      {
        key: 'captureSpreadAnnual',
        label: 'components.statisticsTable.labels.captureSpreadAnnual',
        fmt: 'pct',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.activeManagement',
    rows: [
      { key: 'activeReturn', label: 'components.statisticsTable.labels.activeReturn', fmt: 'pct' },
      {
        key: 'trackingError',
        label: 'components.statisticsTable.labels.trackingError',
        fmt: 'pct',
      },
      {
        key: 'informationRatio',
        label: 'components.statisticsTable.labels.informationRatio',
        fmt: 'ratio',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.varCvar',
    rows: [
      { key: 'varDaily1', label: 'components.statisticsTable.labels.varDaily1', fmt: 'pct' },
      { key: 'varDaily5', label: 'components.statisticsTable.labels.varDaily5', fmt: 'pct' },
      { key: 'varDaily10', label: 'components.statisticsTable.labels.varDaily10', fmt: 'pct' },
      { key: 'cvarDaily1', label: 'components.statisticsTable.labels.cvarDaily1', fmt: 'pct' },
      { key: 'cvarDaily5', label: 'components.statisticsTable.labels.cvarDaily5', fmt: 'pct' },
      { key: 'cvarDaily10', label: 'components.statisticsTable.labels.cvarDaily10', fmt: 'pct' },
      { key: 'varMonthly1', label: 'components.statisticsTable.labels.varMonthly1', fmt: 'pct' },
      { key: 'varMonthly5', label: 'components.statisticsTable.labels.varMonthly5', fmt: 'pct' },
      { key: 'varMonthly10', label: 'components.statisticsTable.labels.varMonthly10', fmt: 'pct' },
      { key: 'cvarMonthly1', label: 'components.statisticsTable.labels.cvarMonthly1', fmt: 'pct' },
      { key: 'cvarMonthly5', label: 'components.statisticsTable.labels.cvarMonthly5', fmt: 'pct' },
      {
        key: 'cvarMonthly10',
        label: 'components.statisticsTable.labels.cvarMonthly10',
        fmt: 'pct',
      },
      { key: 'varAnnual1', label: 'components.statisticsTable.labels.varAnnual1', fmt: 'pct' },
      { key: 'varAnnual5', label: 'components.statisticsTable.labels.varAnnual5', fmt: 'pct' },
      { key: 'varAnnual10', label: 'components.statisticsTable.labels.varAnnual10', fmt: 'pct' },
      { key: 'cvarAnnual1', label: 'components.statisticsTable.labels.cvarAnnual1', fmt: 'pct' },
      { key: 'cvarAnnual5', label: 'components.statisticsTable.labels.cvarAnnual5', fmt: 'pct' },
      { key: 'cvarAnnual10', label: 'components.statisticsTable.labels.cvarAnnual10', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.distribution',
    rows: [
      {
        key: 'skewnessDaily',
        label: 'components.statisticsTable.labels.skewnessDaily',
        fmt: 'ratio',
      },
      {
        key: 'skewnessMonthly',
        label: 'components.statisticsTable.labels.skewnessMonthly',
        fmt: 'ratio',
      },
      {
        key: 'skewnessAnnual',
        label: 'components.statisticsTable.labels.skewnessAnnual',
        fmt: 'ratio',
      },
      {
        key: 'excessKurtosisDaily',
        label: 'components.statisticsTable.labels.excessKurtosisDaily',
        fmt: 'ratio',
      },
      {
        key: 'excessKurtosisMonthly',
        label: 'components.statisticsTable.labels.excessKurtosisMonthly',
        fmt: 'ratio',
      },
      {
        key: 'excessKurtosisAnnual',
        label: 'components.statisticsTable.labels.excessKurtosisAnnual',
        fmt: 'ratio',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.positiveRatio',
    rows: [
      {
        key: 'pctPositiveDays',
        label: 'components.statisticsTable.labels.pctPositiveDays',
        fmt: 'pct',
      },
      {
        key: 'pctPositiveMonths',
        label: 'components.statisticsTable.labels.pctPositiveMonths',
        fmt: 'pct',
      },
      { key: 'pctPositiveYears', label: 'backtest.pctPositiveYears', fmt: 'pct' },
    ],
  },
  {
    title: 'components.statisticsTable.groups.extremeReturns',
    rows: [
      {
        key: 'maxDailyReturn',
        label: 'components.statisticsTable.labels.maxDailyReturn',
        fmt: 'pct',
      },
      {
        key: 'minDailyReturn',
        label: 'components.statisticsTable.labels.minDailyReturn',
        fmt: 'pct',
      },
      {
        key: 'maxMonthlyReturn',
        label: 'components.statisticsTable.labels.maxMonthlyReturn',
        fmt: 'pct',
      },
      {
        key: 'minMonthlyReturn',
        label: 'components.statisticsTable.labels.minMonthlyReturn',
        fmt: 'pct',
      },
      {
        key: 'maxAnnualReturn',
        label: 'components.statisticsTable.labels.maxAnnualReturn',
        fmt: 'pct',
      },
      {
        key: 'minAnnualReturn',
        label: 'components.statisticsTable.labels.minAnnualReturn',
        fmt: 'pct',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.avgGainLoss',
    rows: [
      { key: 'avgDailyGain', label: 'components.statisticsTable.labels.avgDailyGain', fmt: 'pct' },
      { key: 'avgDailyLoss', label: 'components.statisticsTable.labels.avgDailyLoss', fmt: 'pct' },
      {
        key: 'gainLossRatioDaily',
        label: 'components.statisticsTable.labels.gainLossRatioDaily',
        fmt: 'ratio',
      },
      {
        key: 'avgMonthlyGain',
        label: 'components.statisticsTable.labels.avgMonthlyGain',
        fmt: 'pct',
      },
      {
        key: 'avgMonthlyLoss',
        label: 'components.statisticsTable.labels.avgMonthlyLoss',
        fmt: 'pct',
      },
      {
        key: 'gainLossRatioMonthly',
        label: 'components.statisticsTable.labels.gainLossRatioMonthly',
        fmt: 'ratio',
      },
      {
        key: 'avgAnnualGain',
        label: 'components.statisticsTable.labels.avgAnnualGain',
        fmt: 'pct',
      },
      {
        key: 'avgAnnualLoss',
        label: 'components.statisticsTable.labels.avgAnnualLoss',
        fmt: 'pct',
      },
      {
        key: 'gainLossRatioAnnual',
        label: 'components.statisticsTable.labels.gainLossRatioAnnual',
        fmt: 'ratio',
      },
    ],
  },
  {
    title: 'components.statisticsTable.groups.withdrawalRate',
    rows: [
      { key: 'swr10y', label: 'components.statisticsTable.labels.swr10y', fmt: 'pct' },
      { key: 'pwr10y', label: 'components.statisticsTable.labels.pwr10y', fmt: 'pct' },
      { key: 'swr20y', label: 'components.statisticsTable.labels.swr20y', fmt: 'pct' },
      { key: 'pwr20y', label: 'components.statisticsTable.labels.pwr20y', fmt: 'pct' },
      { key: 'swr30y', label: 'components.statisticsTable.labels.swr30y', fmt: 'pct' },
      { key: 'pwr30y', label: 'components.statisticsTable.labels.pwr30y', fmt: 'pct' },
      { key: 'swr40y', label: 'components.statisticsTable.labels.swr40y', fmt: 'pct' },
      { key: 'pwr40y', label: 'components.statisticsTable.labels.pwr40y', fmt: 'pct' },
    ],
  },
];

/** 概览模式：只显示核心指标 */
export const COMPACT_GROUPS: StatGroup[] = [
  {
    title: 'components.statisticsTable.groups.core',
    rows: [
      { key: 'cagr', label: 'backtest.cagr', fmt: 'pct' },
      { key: 'stdev', label: 'backtest.stdev', fmt: 'pct' },
      { key: 'sharpe', label: 'backtest.sharpeRatio', fmt: 'ratio' },
      { key: 'sortino', label: 'backtest.sortino', fmt: 'ratio' },
      { key: 'maxDrawdown', label: 'backtest.maxDrawdown', fmt: 'pct' },
      { key: 'avgDrawdown', label: 'components.statisticsTable.labels.avgDrawdown', fmt: 'pct' },
      {
        key: 'maxDrawdownDuration',
        label: 'components.statisticsTable.labels.maxDrawdownDuration',
        fmt: 'duration',
      },
      { key: 'calmar', label: 'backtest.calmar', fmt: 'ratio' },
      { key: 'ulcerIndex', label: 'components.statisticsTable.labels.ulcerIndex', fmt: 'ratio' },
      {
        key: 'diversificationRatio',
        label: 'components.statisticsTable.labels.diversificationRatio',
        fmt: 'ratio',
      },
      { key: 'pctPositiveYears', label: 'backtest.pctPositiveYears', fmt: 'pct' },
      { key: 'bestYear', label: 'components.statisticsTable.labels.bestYear', fmt: 'pct' },
      { key: 'worstYear', label: 'components.statisticsTable.labels.worstYear', fmt: 'pct' },
    ],
  },
];
