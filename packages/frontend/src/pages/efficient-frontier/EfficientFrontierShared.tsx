/**
 * @file 有效前沿结果共享类型与原子组件
 * @description 承载 FrontierResultsProps 接口，以及 WeightBar/MetricCard/WeightAllocation/
 *              StatCard/LoadInBacktesterButton 等被多个子组件复用的小组件。
 *              非组件导出（sharpeToColor、SECTION_TITLE_STYLE）已移至 efficientFrontierSharedConstants.ts，
 *              避免触发 react-refresh/only-export-components 规则。
 */
import { ArrowRight } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierPoint, EfficientFrontierResult } from '@backtest/shared';
import { Button } from '@/components/ui/button';
import type { ReturnObjective, FrontierSolver } from './EfficientFrontierParams.js';

/** FrontierResults 容器组件 props */
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

/** 权重条：标的代码 + 进度条 + 百分比 */
export function WeightBar({
  ticker,
  weight,
  color,
}: {
  ticker: string;
  weight: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[60px] shrink-0 text-label font-medium text-fg">{ticker}</span>
      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-input-bg">
        <div
          className="h-full rounded-sm"
          style={{ width: `${weight * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-caption tabular-nums text-fg-tertiary">
        {(weight * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/** 指标卡：标签 + 值（等宽字体、可选颜色） */
export function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-md bg-elevated p-2.5">
      <div className="text-caption text-fg-tertiary">{label}</div>
      <div className="font-mono text-h3 font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/** 权重分配组：标题 + 多条 WeightBar */
export function WeightAllocation({
  weights,
  title,
}: {
  weights: Record<string, number>;
  title: string;
}) {
  return (
    <div>
      <div className="mb-2 text-caption text-fg-tertiary">{title}</div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(weights).map(([ticker, weight], i) => (
          <WeightBar
            key={ticker}
            ticker={ticker}
            weight={weight}
            color={CHART_COLORS[i % CHART_COLORS.length]}
          />
        ))}
      </div>
    </div>
  );
}

/** 静态指标卡（居中、紧凑） */
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

/** "加载到回测器" 按钮（shadcn Button ghost 变体 + ArrowRight 图标） */
export function LoadInBacktesterButton({
  onClick,
  label,
  size = 'md',
}: {
  onClick: () => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <Button onClick={onClick} variant="ghost" size={size === 'sm' ? 'sm' : 'default'}>
      <ArrowRight className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {label}
    </Button>
  );
}
