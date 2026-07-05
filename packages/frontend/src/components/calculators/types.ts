export interface FieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface ResultRowProps {
  label: string;
  value: string | number;
  color?: string;
}

export interface TwoFundFrontierResult {
  frontier: Array<{ wA: number; cagr: number; vol: number }>;
  minVarW: number;
  minVarCagr: number;
  minVarVol: number;
}

export const CHART_COLORS = ['#2b63b8', '#06b6d4', '#2e8b57', '#f97316', '#c94a4a'];
