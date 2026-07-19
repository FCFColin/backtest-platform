/**
 * @file 有效前沿结果共享类型与原子组件
 * @description 承载 FrontierResultsProps 接口，以及 WeightBar/MetricCard/WeightAllocation/
 *              StatCard/LoadInBacktesterButton 等被多个子组件复用的小组件。
 *              非组件导出（sharpeToColor、SECTION_TITLE_STYLE）已移至 efficientFrontierSharedConstants.ts，
 *              避免触发 react-refresh/only-export-components 规则。
 */
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierPoint, EfficientFrontierResult } from '@backtest/shared';
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

/** 权重条 */
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 60, fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>
        {ticker}
      </span>
      <div
        style={{
          flex: 1,
          height: 16,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: 4,
            width: `${weight * 100}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
        {(weight * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/** 指标卡 */
export function MetricCard({
  label,
  value,
  color,
  padding = 10,
  fontSize = 15,
}: {
  label: string;
  value: string;
  color: string;
  padding?: number;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        padding,
        backgroundColor: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize,
          fontWeight: 600,
          fontFamily: 'monospace',
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** 权重分配组 */
export function WeightAllocation({
  weights,
  title,
}: {
  weights: Record<string, number>;
  title: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
    <div
      style={{
        textAlign: 'center',
        padding: 12,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'monospace',
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** "加载到回测器" 按钮 */
export function LoadInBacktesterButton({
  onClick,
  label,
  size = 'md',
}: {
  onClick: () => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  const [hovered, setHovered] = useState(false);
  const fontSize = size === 'sm' ? 11 : 12;
  const padding = size === 'sm' ? '4px 10px' : '6px 14px';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size === 'sm' ? 4 : 6,
        padding,
        borderRadius: 'var(--radius-control)',
        border: '1px solid var(--brand)',
        backgroundColor: hovered ? 'var(--brand)' : 'transparent',
        color: hovered ? '#fff' : 'var(--brand)',
        fontSize,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all .15s',
      }}
    >
      <ArrowRight className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {label}
    </button>
  );
}
