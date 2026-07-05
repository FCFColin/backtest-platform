/** @file Asset analysis shared types */

export type RollingMetricKey = 'cagr' | 'volatility' | 'excess' | 'skewness' | 'kurtosis' | 'kelly';

export type RiskMetricKey = 'stdev' | 'maxDrawdown' | 'avgDrawdown' | 'ulcerIndex';

export type AnalysisTabKey =
  'summary' | 'telltale' | 'correlations' | 'rolling' | 'risk-return' | 'returns';
