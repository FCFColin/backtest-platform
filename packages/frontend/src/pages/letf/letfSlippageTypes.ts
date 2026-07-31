export interface SlippageCurveDataPoint {
  date: string;
  cumulative: number;
  daily: number;
}
export interface LeverageComparisonDataPoint {
  date: string;
  effective: number | null;
  nominal: number;
}
