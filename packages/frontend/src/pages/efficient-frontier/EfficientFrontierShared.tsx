import { ArrowRight } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierPoint, EfficientFrontierResult } from '@backtest/shared';
import { Button } from '@/components/ui/uiComponents';
import type { ReturnObjective, FrontierSolver } from './EfficientFrontierParams.js';
export interface FrontierResultsProps {
  results: EfficientFrontierResult;
  scatterData: Array<{
    expectedVolatility: number;
    expectedReturn: number;
    sharpeRatio: number;
    idx: number;
  }>;
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  allocationData: Record<string, number | string>[];
  allAssetTickers: string[];
  correlations: { tickers: string[]; matrix: number[][] } | null;
  correlationError: string | null;
  selectedPoint: EfficientFrontierPoint | null;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: (p?: EfficientFrontierPoint) => void;
}
export function WeightBar({ ticker, weight, color }: { ticker: string; weight: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[60px] shrink-0 text-label font-medium text-fg">{ticker}</span>
      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-input-bg">
        <div className="h-full rounded-sm" style={{ width: `${weight * 100}%`, backgroundColor: color }} />
      </div>
      <span className="font-mono text-caption tabular-nums text-fg-tertiary">{(weight * 100).toFixed(1)}%</span>
    </div>
  );
}
export function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-elevated p-2.5">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="font-mono text-h3 font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
export function WeightAllocation({ weights, title }: { weights: Record<string, number>; title: string }) {
  return (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([ticker, weight], i) => (
          <WeightBar key={ticker} ticker={ticker} weight={weight} color={CHART_COLORS[i % CHART_COLORS.length]} />
        ))}
      </div>
    </div>
  );
}
export function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-input-bg p-3 text-center">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div className="font-mono text-h3 font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
export function LoadInBacktesterButton({ onClick, label, size = 'md' }: { onClick: () => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <Button onClick={onClick} variant="ghost" size={size === 'sm' ? 'sm' : 'default'}>
      <ArrowRight className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {label}
    </Button>
  );
}
