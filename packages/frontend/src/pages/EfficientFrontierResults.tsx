import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';
import type { ReturnObjective, FrontierSolver } from './EfficientFrontierParams.js';

function sharpeToColor(sharpe: number, minSharpe: number, maxSharpe: number): string {
  if (maxSharpe === minSharpe) return '#2e8b57';
  const t = Math.max(0, Math.min(1, (sharpe - minSharpe) / (maxSharpe - minSharpe)));
  const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 220);
  const g = t < 0.5 ? Math.round(t * 2 * 180) : 180;
  const b = t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 2 * 37);
  return `rgb(${r},${g},${b})`;
}

const POSITIVE_CORR_COLORS: Array<[number, string]> = [
  [0.8, '#1a4a7a'],
  [0.6, '#2b63b8'],
  [0.4, '#6a9fd8'],
  [0.2, '#b8d4f0'],
];
const NEGATIVE_CORR_COLORS: Array<[number, string]> = [
  [-0.8, '#8b2020'],
  [-0.6, '#b04040'],
  [-0.4, '#d47070'],
  [-0.2, '#f0c8c8'],
];

function getCorrelationColor(val: number): string {
  const thresholds = val >= 0 ? POSITIVE_CORR_COLORS : NEGATIVE_CORR_COLORS;
  for (const [threshold, color] of thresholds) {
    if (val >= 0 ? val >= threshold : val <= threshold) return color;
  }
  return 'var(--bg-subtle)';
}

const REBALANCE_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--text-strong)',
  marginBottom: 12,
  marginTop: 24,
};

const FRONTIER_TOOLTIP_STYLE = {
  fontSize: 12,
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  boxShadow: 'var(--shadow-md)',
};

function WeightBar({ ticker, weight, color }: { ticker: string; weight: number; color: string }) {
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

interface FrontierResultsProps {
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

function LoadInBacktesterButton({
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

function MetricCard({
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

function WeightAllocation({ weights, title }: { weights: Record<string, number>; title: string }) {
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

function FrontierScatterChartInner({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
}: {
  scatterData: FrontierResultsProps['scatterData'];
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
}) {
  return (
    <ScatterChart>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
      <XAxis
        dataKey="expectedVolatility"
        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
        label={{
          value: '波动率 (%)',
          position: 'insideBottom',
          offset: -5,
          fontSize: 12,
          fill: 'var(--text-muted)',
        }}
      />
      <YAxis
        dataKey="expectedReturn"
        tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
        label={{
          value: '收益率 (%)',
          angle: -90,
          position: 'insideLeft',
          fontSize: 12,
          fill: 'var(--text-muted)',
        }}
      />
      <ZAxis range={[60, 60]} />
      <Tooltip
        formatter={(v: number) => `${v.toFixed(2)}%`}
        contentStyle={FRONTIER_TOOLTIP_STYLE}
      />
      <Scatter
        data={scatterData}
        onClick={(data: { idx?: number }) => {
          if (data?.idx != null && frontier[data.idx]) onSelectPoint(frontier[data.idx]);
        }}
      >
        {scatterData.map((entry, index) => (
          <Cell
            key={index}
            fill={sharpeToColor(entry.sharpeRatio, sharpeRange.min, sharpeRange.max)}
          />
        ))}
      </Scatter>
      {maxSharpe && (
        <Scatter
          data={[
            {
              expectedVolatility: maxSharpe.expectedVolatility,
              expectedReturn: maxSharpe.expectedReturn,
            },
          ]}
          fill={CHART_COLORS[0]}
          shape="star"
        />
      )}
    </ScatterChart>
  );
}

function FrontierScatterChart({
  scatterData,
  sharpeRange,
  maxSharpe,
  frontier,
  onSelectPoint,
  onLoadInBacktester,
}: {
  scatterData: FrontierResultsProps['scatterData'];
  sharpeRange: { min: number; max: number };
  maxSharpe: EfficientFrontierPoint | undefined;
  frontier: EfficientFrontierPoint[];
  onSelectPoint: (p: EfficientFrontierPoint) => void;
  onLoadInBacktester: () => void;
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>有效前沿</div>
        <LoadInBacktesterButton onClick={onLoadInBacktester} label="Load in backtester" />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <FrontierScatterChartInner
          scatterData={scatterData}
          sharpeRange={sharpeRange}
          maxSharpe={maxSharpe}
          frontier={frontier}
          onSelectPoint={onSelectPoint}
        />
      </ResponsiveContainer>
    </>
  );
}

function FrontierAllocations({
  allocationData,
  allAssetTickers,
}: {
  allocationData: Record<string, number | string>[];
  allAssetTickers: string[];
}) {
  if (allocationData.length === 0 || allAssetTickers.length === 0) return null;
  return (
    <>
      <div style={SECTION_TITLE_STYLE}>Frontier Allocations</div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={allocationData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="point"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            label={{
              value: '前沿点',
              position: 'insideBottom',
              offset: -5,
              fontSize: 11,
              fill: 'var(--text-muted)',
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip formatter={(v: number) => `${v}%`} contentStyle={FRONTIER_TOOLTIP_STYLE} />
          {allAssetTickers.map((ticker, i) => (
            <Area
              key={ticker}
              type="monotone"
              dataKey={ticker}
              stackId="1"
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.8}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {allAssetTickers.map((ticker, i) => (
          <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{ticker}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CorrelationMatrixView({
  correlations,
}: {
  correlations: { tickers: string[]; matrix: number[][] } | null;
}) {
  if (!correlations || correlations.tickers.length < 2) return null;
  return (
    <>
      <div style={SECTION_TITLE_STYLE}>Correlation Matrix</div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th
                className="px-3 py-2 text-[11px] font-medium"
                style={{ color: 'var(--text-muted)' }}
              />
              {correlations.tickers.map((t) => (
                <th
                  key={t}
                  className="px-3 py-2 text-[11px] font-medium text-center"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {correlations.tickers.map((rowTicker, i) => (
              <tr key={rowTicker}>
                <td
                  className="px-3 py-2 text-[12px] font-medium"
                  style={{ color: 'var(--text-body)' }}
                >
                  {rowTicker}
                </td>
                {correlations.tickers.map((colTicker, j) => {
                  const val = correlations.matrix[i]?.[j] ?? 0;
                  return (
                    <td
                      key={colTicker}
                      className="text-[12px] text-center cursor-default"
                      style={{
                        backgroundColor: getCorrelationColor(val),
                        color: Math.abs(val) > 0.6 ? '#fff' : '#000',
                        width: `${Math.max(48, 600 / correlations.tickers.length)}px`,
                        height: `${Math.max(36, 400 / correlations.tickers.length)}px`,
                      }}
                      title={`${rowTicker} vs ${colTicker}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SelectedPointDetail({
  selectedPoint,
  onLoadInBacktester,
}: {
  selectedPoint: EfficientFrontierPoint | null;
  onLoadInBacktester: (p: EfficientFrontierPoint) => void;
}) {
  if (!selectedPoint) return null;
  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
          选中组合详情
        </div>
        <LoadInBacktesterButton
          onClick={() => onLoadInBacktester(selectedPoint)}
          label="Load"
          size="sm"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <WeightAllocation weights={selectedPoint.weights} title="权重分配" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MetricCard
            label="预期收益"
            value={`${selectedPoint.expectedReturn.toFixed(2)}%`}
            color="var(--success)"
          />
          <MetricCard
            label="预期波动率"
            value={`${selectedPoint.expectedVolatility.toFixed(2)}%`}
            color="var(--warning)"
          />
          <MetricCard
            label="夏普比率"
            value={selectedPoint.sharpeRatio.toFixed(2)}
            color="var(--brand)"
          />
        </div>
      </div>
    </div>
  );
}

function MaxSharpeSection({ maxSharpe }: { maxSharpe: EfficientFrontierPoint | undefined }) {
  if (!maxSharpe) return null;
  return (
    <>
      <div style={SECTION_TITLE_STYLE}>最大夏普组合</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>权重</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(maxSharpe.weights).map(([ticker, weight], i) => (
              <WeightBar
                key={ticker}
                ticker={ticker}
                weight={weight}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricCard
            label="预期收益"
            value={`${maxSharpe.expectedReturn.toFixed(2)}%`}
            color="var(--success)"
            padding={12}
            fontSize={16}
          />
          <MetricCard
            label="预期波动率"
            value={`${maxSharpe.expectedVolatility.toFixed(2)}%`}
            color="var(--warning)"
            padding={12}
            fontSize={16}
          />
          <MetricCard
            label="夏普比率"
            value={maxSharpe.sharpeRatio.toFixed(2)}
            color="var(--brand)"
            padding={12}
            fontSize={16}
          />
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
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

function ParamsSummary({
  rebalanceFrequency,
  allowCash,
  returnObjective,
  solver,
}: {
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
}) {
  return (
    <>
      <div style={SECTION_TITLE_STYLE}>参数汇总</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard
          label="调仓频率"
          value={REBALANCE_LABELS[rebalanceFrequency] || rebalanceFrequency}
          color="var(--text-body)"
        />
        <StatCard
          label="允许现金分配"
          value={allowCash ? '是' : '否'}
          color={allowCash ? 'var(--success)' : 'var(--text-muted)'}
        />
        <StatCard
          label="收益目标"
          value={returnObjective === 'maxCagr' ? 'Max CAGR' : 'Min Vol'}
          color="var(--text-body)"
        />
        <StatCard
          label="求解器"
          value={solver === 'markowitz' ? 'Markowitz' : 'NSGA-II'}
          color="var(--text-body)"
        />
      </div>
    </>
  );
}

function FrontierResults(props: FrontierResultsProps) {
  const {
    results: r,
    scatterData,
    sharpeRange,
    maxSharpe,
    allocationData,
    allAssetTickers,
    correlations,
    selectedPoint,
    rebalanceFrequency,
    allowCash,
    returnObjective,
    solver,
    onSelectPoint,
    onLoadInBacktester,
  } = props;
  return (
    <div className="bt-results-card card">
      <FrontierScatterChart
        scatterData={scatterData}
        sharpeRange={sharpeRange}
        maxSharpe={maxSharpe}
        frontier={r.frontier}
        onSelectPoint={onSelectPoint}
        onLoadInBacktester={() => onLoadInBacktester()}
      />
      <FrontierAllocations allocationData={allocationData} allAssetTickers={allAssetTickers} />
      <CorrelationMatrixView correlations={correlations} />
      <SelectedPointDetail selectedPoint={selectedPoint} onLoadInBacktester={onLoadInBacktester} />
      <MaxSharpeSection maxSharpe={maxSharpe} />
      <ParamsSummary
        rebalanceFrequency={rebalanceFrequency}
        allowCash={allowCash}
        returnObjective={returnObjective}
        solver={solver}
      />
    </div>
  );
}

export { FrontierResults };
export type { FrontierResultsProps };
