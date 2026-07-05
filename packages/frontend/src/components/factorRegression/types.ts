export type ReturnFrequency = 'monthly' | 'daily';

export interface FactorRegressionResult {
  alpha: number;
  beta: number;
  smb: number;
  hml: number;
  rSquared: number;
  residuals: number[];
}

export const FACTOR_OPTIONS = [
  { key: 'mktRF', label: 'MKT-RF', desc: '市场超额收益' },
  { key: 'smb', label: 'SMB', desc: '小盘股溢价' },
  { key: 'hml', label: 'HML', desc: '价值股溢价' },
];

export const RF_SOURCE_OPTIONS = [
  { value: 'us-3m', label: '美国3月期国债' },
  { value: 'us-1y', label: '美国1年期国债' },
];

export interface AssetItem {
  ticker: string;
  weight: number;
}

export interface FetchRegressionParams {
  validAssets: AssetItem[];
  startDate: string;
  endDate: string;
  selectedFactors: string[];
  returnFrequency: ReturnFrequency;
  rfSource: string;
}

export interface FactorSelectorProps {
  selectedFactors: string[];
  onToggle: (key: string) => void;
}

export interface FactorParamsProps {
  startDate: string;
  endDate: string;
  returnFrequency: ReturnFrequency;
  rfSource: string;
  selectedFactors: string[];
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onReturnFrequencyChange: (v: ReturnFrequency) => void;
  onRfSourceChange: (v: string) => void;
  onToggleFactor: (key: string) => void;
}

export interface PortfolioEditorProps {
  assets: AssetItem[];
  totalWeight: number;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
}

export interface RegressionResultProps {
  result: FactorRegressionResult;
  selectedFactors: string[];
}
