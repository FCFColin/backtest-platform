export interface Asset {
  id?: string;
  ticker: string;
  weight: number;
}

export type RebalanceFrequency =
  'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'none' | 'threshold';

export interface RebalanceBands {
  enabled: boolean;
  absoluteBand?: number;
  relativeBand?: number;
  upperBand?: number;
  lowerBand?: number;
}

export interface Portfolio {
  id: string;
  name: string;
  assets: Asset[];
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  rebalanceOffset?: number;
  rebalanceBands?: RebalanceBands;
  drag?: number;
  totalReturn?: boolean;
  isGlidepath?: boolean;
  glidepathFrom?: string;
  glidepathTo?: string;
  glidepathYears?: number;
  glidepathToWeights?: number[];
  tags?: string[];
}
