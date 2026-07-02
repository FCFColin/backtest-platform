/**
 * @file 有效前沿页面
 * @description 基于 Markowitz 或 NSGA-II 求解器计算投资组合有效前沿，展示风险收益散点及夏普比率着色
 * @route /efficient-frontier
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Plus, X, ArrowRight } from 'lucide-react';
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
import { CHART_COLORS } from '../../shared/types';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';

type SolveSpeed = 'ultrafast' | 'fast' | 'medium' | 'slow';
type FrontierSolver = 'markowitz' | 'nsga2';
type ReturnObjective = 'maxCagr' | 'minVolatility';

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

function buildBacktestParameters(startDate: string, endDate: string) {
  return {
    startDate,
    endDate,
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    baseCurrency: 'usd',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
}

interface FetchFrontierParams {
  validTickers: string[];
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  startDate: string;
  endDate: string;
}

async function fetchFrontier(params: FetchFrontierParams): Promise<EfficientFrontierResult> {
  const {
    validTickers,
    numPoints,
    solveSpeed,
    minInclusionWeight,
    rebalanceFrequency,
    allowCash,
    returnObjective,
    solver,
    startDate,
    endDate,
  } = params;
  const res = await fetch('/api/backtest/efficient-frontier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tickers: validTickers,
      numPoints,
      solveSpeed,
      minInclusionWeight: minInclusionWeight / 100,
      rebalanceFrequency,
      allowCash,
      returnObjective,
      solver,
      parameters: buildBacktestParameters(startDate, endDate),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || '计算失败');
  return json.data ?? json;
}

async function fetchCorrelations(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ tickers: string[]; matrix: number[][] } | null> {
  const btBody = {
    portfolios: [
      {
        name: 'temp',
        assets: validTickers.map((t) => ({
          ticker: t,
          weight: Math.round((100 / validTickers.length) * 100) / 100,
        })),
        rebalanceFrequency: 'yearly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: buildBacktestParameters(startDate, endDate),
  };
  const btRes = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(btBody),
  });
  if (!btRes.ok) return null;
  const btJson = await btRes.json();
  const btData = btJson.data ?? btJson;
  if (btData.assetTickers && btData.assetCorrelations)
    return { tickers: btData.assetTickers, matrix: btData.assetCorrelations };
  return null;
}

function buildPortfolioData(
  p: EfficientFrontierPoint,
  rebalanceFrequency: string,
  startDate: string,
  endDate: string,
) {
  return {
    portfolios: [
      {
        id: `portfolio-${Date.now()}-1`,
        name: '前沿组合',
        assets: Object.entries(p.weights).map(([ticker, weight]) => ({
          ticker,
          weight: Math.round(weight * 10000) / 100,
        })),
        rebalanceFrequency: rebalanceFrequency || 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: {
      startDate,
      endDate,
      startingValue: 10000,
      baseCurrency: 'usd',
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: '',
      extendedWithdrawalStats: false,
      cashflowLegs: [],
      oneTimeCashflows: [],
    },
  };
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

// ===== 参数面板 =====

interface FrontierParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onAddTicker: () => void;
  onRemoveTicker: (i: number) => void;
  onUpdateTicker: (i: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumPointsChange: (v: number) => void;
  onSolveSpeedChange: (v: SolveSpeed) => void;
  onMinInclusionWeightChange: (v: number) => void;
  onRebalanceFrequencyChange: (v: string) => void;
  onAllowCashChange: (v: boolean) => void;
  onReturnObjectiveChange: (v: ReturnObjective) => void;
  onSolverChange: (v: FrontierSolver) => void;
  isLoading: boolean;
  onRun: () => void;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="param-field">
      <span className="param-label">{label}</span>
      <select className="param-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const SOLVE_SPEED_OPTIONS = [
  { value: 'ultrafast', label: '极速' }, { value: 'fast', label: '快速' },
  { value: 'medium', label: '中等' }, { value: 'slow', label: '慢速' },
];
const REBALANCE_FREQ_OPTIONS = [
  { value: 'daily', label: '每日' }, { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' }, { value: 'quarterly', label: '每季度' },
  { value: 'yearly', label: '每年' },
];
const RETURN_OBJ_OPTIONS = [
  { value: 'maxCagr', label: '最大化 CAGR' }, { value: 'minVolatility', label: '最小化波动率' },
];
const SOLVER_OPTIONS = [
  { value: 'markowitz', label: 'Markowitz' }, { value: 'nsga2', label: 'NSGA-II' },
];

function FrontierDateRange({ p }: { p: FrontierParamsProps }) {
  return (
    <>
      <label className="param-check">
        <input type="checkbox" checked={p.startDate === '' && p.endDate === ''} onChange={(e) => {
          if (e.target.checked) { p.onStartDateChange(''); p.onEndDateChange(''); }
          else { p.onStartDateChange('2010-01-01'); p.onEndDateChange('2024-12-31'); }
        }} />
        <span>全部历史</span>
      </label>
      <div className="param-field"><span className="param-label">开始日期</span><input type="date" className="param-input" value={p.startDate} onChange={(e) => p.onStartDateChange(e.target.value)} /></div>
      <div className="param-field"><span className="param-label">结束日期</span><input type="date" className="param-input" value={p.endDate} onChange={(e) => p.onEndDateChange(e.target.value)} /></div>
      <div className="param-field"><span className="param-label">采样点数</span><input type="number" className="param-input" value={p.numPoints} onChange={(e) => p.onNumPointsChange(Number(e.target.value))} min={5} max={100} /></div>
    </>
  );
}

function FrontierAdvancedFields({ p }: { p: FrontierParamsProps }) {
  return (
    <>
      <SelectField label="求解速度" value={p.solveSpeed} onChange={(v) => p.onSolveSpeedChange(v as SolveSpeed)} options={SOLVE_SPEED_OPTIONS} />
      <div className="param-field param-field-rolling">
        <span className="param-label">最小包含权重</span>
        <div className="param-input-suffix-wrap">
          <input type="number" className="param-input param-input-with-suffix" value={p.minInclusionWeight} onChange={(e) => p.onMinInclusionWeightChange(Number(e.target.value))} min={0} max={100} />
          <span className="param-input-suffix">%</span>
        </div>
      </div>
      <SelectField label="调仓频率" value={p.rebalanceFrequency} onChange={p.onRebalanceFrequencyChange} options={REBALANCE_FREQ_OPTIONS} />
      <SelectField label="收益目标" value={p.returnObjective} onChange={(v) => p.onReturnObjectiveChange(v as ReturnObjective)} options={RETURN_OBJ_OPTIONS} />
      <SelectField label="求解器" value={p.solver} onChange={(v) => p.onSolverChange(v as FrontierSolver)} options={SOLVER_OPTIONS} />
      <label className="param-check"><input type="checkbox" checked={p.allowCash} onChange={(e) => p.onAllowCashChange(e.target.checked)} /><span>允许现金分配</span></label>
    </>
  );
}

function FrontierParamsFields({ p }: { p: FrontierParamsProps }) {
  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>
      <div className="params-row">
        <FrontierDateRange p={p} />
        <FrontierAdvancedFields p={p} />
      </div>
    </div>
  );
}

function FrontierTickerList({ p }: { p: FrontierParamsProps }) {
  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">标的列表</span>
        <button className="portfolios-add-btn" onClick={p.onAddTicker}>
          <Plus className="w-4 h-4" />
          添加标的
        </button>
      </div>
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {p.tickers.map((t, i) => (
            <div key={t || i} className="ticker-row">
              <input
                type="text"
                value={t}
                onChange={(e) => p.onUpdateTicker(i, e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              {p.tickers.length > 2 && (
                <button
                  onClick={() => p.onRemoveTicker(i)}
                  className="row-remove-btn"
                  title="删除"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrontierParams(props: FrontierParamsProps) {
  return (
    <div className="bt-main-card card">
      <FrontierParamsFields p={props} />
      <div className="bt-action-row">
        <LoadingButton isLoading={props.isLoading} onClick={props.onRun} loadingText="计算中...">
          <Play className="w-4 h-4" />
          计算有效前沿
        </LoadingButton>
      </div>
      <FrontierTickerList p={props} />
    </div>
  );
}

// ===== 权重条子组件 =====
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

// ===== 结果展示子组件 =====

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

function WeightAllocation({
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

function FrontierScatterChartInner({
  scatterData, sharpeRange, maxSharpe, frontier, onSelectPoint,
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
      <XAxis dataKey="expectedVolatility" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '波动率 (%)', position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
      <YAxis dataKey="expectedReturn" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '收益率 (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
      <ZAxis range={[60, 60]} />
      <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={FRONTIER_TOOLTIP_STYLE} />
      <Scatter data={scatterData} onClick={(data: { idx?: number }) => { if (data?.idx != null && frontier[data.idx]) onSelectPoint(frontier[data.idx]); }}>
        {scatterData.map((entry, index) => (
          <Cell key={index} fill={sharpeToColor(entry.sharpeRatio, sharpeRange.min, sharpeRange.max)} />
        ))}
      </Scatter>
      {maxSharpe && (
        <Scatter data={[{ expectedVolatility: maxSharpe.expectedVolatility, expectedReturn: maxSharpe.expectedReturn }]} fill={CHART_COLORS[0]} shape="star" />
      )}
    </ScatterChart>
  );
}

function FrontierScatterChart({
  scatterData, sharpeRange, maxSharpe, frontier, onSelectPoint, onLoadInBacktester,
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>有效前沿</div>
        <LoadInBacktesterButton onClick={onLoadInBacktester} label="Load in backtester" />
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <FrontierScatterChartInner scatterData={scatterData} sharpeRange={sharpeRange} maxSharpe={maxSharpe} frontier={frontier} onSelectPoint={onSelectPoint} />
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
          <Tooltip
            formatter={(v: number) => `${v}%`}
            contentStyle={FRONTIER_TOOLTIP_STYLE}
          />
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
              <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
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
                        color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
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

function MaxSharpeSection({
  maxSharpe,
}: {
  maxSharpe: EfficientFrontierPoint | undefined;
}) {
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
  const { results: r, scatterData, sharpeRange, maxSharpe, allocationData, allAssetTickers, correlations, selectedPoint, rebalanceFrequency, allowCash, returnObjective, solver, onSelectPoint, onLoadInBacktester } = props;
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

// ===== 主页面 =====
function useEfficientFrontierState(navigate: (path: string) => void) {
  const [tickers, setTickers] = useState(['VTI', 'VXUS', 'BND', 'TLT']);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [numPoints, setNumPoints] = useState(20);
  const [solveSpeed, setSolveSpeed] = useState<SolveSpeed>('fast');
  const [minInclusionWeight, setMinInclusionWeight] = useState(0);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<EfficientFrontierResult | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<EfficientFrontierPoint | null>(null);
  const [correlations, setCorrelations] = useState<{
    tickers: string[];
    matrix: number[][];
  } | null>(null);
  const [correlationError, setCorrelationError] = useState<string | null>(null);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<string>('yearly');
  const [allowCash, setAllowCash] = useState(false);
  const [returnObjective, setReturnObjective] = useState<ReturnObjective>('maxCagr');
  const [solver, setSolver] = useState<FrontierSolver>('markowitz');

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (i: number) => {
    if (tickers.length > 2) setTickers(tickers.filter((_, idx) => idx !== i));
  };
  const updateTicker = (i: number, val: string) => {
    const n = [...tickers];
    n[i] = val;
    setTickers(n);
  };

  const { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers } = useMemo(() => computeFrontierDerivedData(results), [results]);

  const runFrontier = () => {
    const validTickers = tickers.filter(Boolean);
    if (validTickers.length < 2) { setError('请至少输入两个标的代码'); return; }
    setSelectedPoint(null);
    setCorrelations(null);
    setCorrelationError(null);
    run(async () => {
      const data = await fetchFrontier({
        validTickers, numPoints, solveSpeed, minInclusionWeight,
        rebalanceFrequency, allowCash, returnObjective, solver, startDate, endDate,
      });
      setResults(data);
      const corr = await fetchCorrelations(validTickers, startDate, endDate);
      if (corr) setCorrelations(corr);
      else setCorrelationError('相关性矩阵计算失败');
    });
  };

  const handleLoadInBacktester = (point?: EfficientFrontierPoint) => {
    const p = point || maxSharpe;
    if (!p) return;
    localStorage.setItem(
      'bt_load_from_optimizer',
      JSON.stringify(buildPortfolioData(p, rebalanceFrequency, startDate, endDate)),
    );
    navigate('/');
  };

  return {
    tickers, startDate, endDate, numPoints, solveSpeed, minInclusionWeight,
    isLoading, error, results, selectedPoint, correlations, correlationError,
    rebalanceFrequency, allowCash, returnObjective, solver,
    maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers,
    addTicker, removeTicker, updateTicker, runFrontier, handleLoadInBacktester,
    setStartDate, setEndDate, setNumPoints, setSolveSpeed, setMinInclusionWeight,
    setRebalanceFrequency, setAllowCash, setReturnObjective, setSolver, setSelectedPoint,
  };
}

function computeFrontierDerivedData(results: EfficientFrontierResult | null) {
  const maxSharpe = results?.frontier.length
    ? results.frontier.reduce((best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best), results.frontier[0])
    : undefined;
  const sharpeRange = results?.frontier.length
    ? { min: Math.min(...results.frontier.map((p) => p.sharpeRatio)), max: Math.max(...results.frontier.map((p) => p.sharpeRatio)) }
    : { min: 0, max: 1 };
  const scatterData = results
    ? results.frontier.map((p, idx) => ({ expectedVolatility: p.expectedVolatility, expectedReturn: p.expectedReturn, sharpeRatio: p.sharpeRatio, idx }))
    : [];
  const allocationData = results
    ? results.frontier.map((point, idx) => {
        const row: Record<string, number | string> = { point: idx + 1 };
        Object.entries(point.weights).forEach(([ticker, weight]) => { row[ticker] = Number((weight * 100).toFixed(1)); });
        return row;
      })
    : [];
  const allAssetTickers = results?.frontier.length ? Object.keys(results.frontier[0].weights) : [];
  return { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers };
}

function FrontierSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        有效前沿工具帮助您从单一"最优"组合扩展到完整的历史测试组合图谱。它生成一系列在收益与风险之间权衡的组合。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可视化</div>
          <div className="bt-seo-feature-desc">
            以散点图展示风险-收益权衡，按夏普比率从红到绿渐变着色，标注最大夏普比率组合，点击查看权重详情。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">约束条件</div>
          <div className="bt-seo-feature-desc">
            支持调仓频率、现金分配、收益/风险目标、求解器选择、最小包含权重等约束设置。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>组合回测</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>资产分析</Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>蒙特卡洛模拟</Link>
      </div>
    </div>
  );
}

export default function EfficientFrontierPage() {
  const navigate = useNavigate();
  const s = useEfficientFrontierState(navigate);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">有效前沿</h1>
      </div>
      <FrontierSeoCard />
      <FrontierParams
        tickers={s.tickers}
        startDate={s.startDate}
        endDate={s.endDate}
        numPoints={s.numPoints}
        solveSpeed={s.solveSpeed}
        minInclusionWeight={s.minInclusionWeight}
        rebalanceFrequency={s.rebalanceFrequency}
        allowCash={s.allowCash}
        returnObjective={s.returnObjective}
        solver={s.solver}
        onAddTicker={s.addTicker}
        onRemoveTicker={s.removeTicker}
        onUpdateTicker={s.updateTicker}
        onStartDateChange={s.setStartDate}
        onEndDateChange={s.setEndDate}
        onNumPointsChange={s.setNumPoints}
        onSolveSpeedChange={s.setSolveSpeed}
        onMinInclusionWeightChange={s.setMinInclusionWeight}
        onRebalanceFrequencyChange={s.setRebalanceFrequency}
        onAllowCashChange={s.setAllowCash}
        onReturnObjectiveChange={s.setReturnObjective}
        onSolverChange={s.setSolver}
        isLoading={s.isLoading}
        onRun={s.runFrontier}
      />
      {s.error && (
        <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>计算失败：{s.error}</div>
      )}
      {s.correlationError && !s.error && (
        <div className="bt-results-card card" style={{ color: 'var(--warning, #f59e0b)', textAlign: 'center', padding: 16 }}>{s.correlationError}</div>
      )}
      {s.results && s.results.frontier.length > 0 && (
        <FrontierResults
          results={s.results}
          scatterData={s.scatterData}
          sharpeRange={s.sharpeRange}
          maxSharpe={s.maxSharpe}
          allocationData={s.allocationData}
          allAssetTickers={s.allAssetTickers}
          correlations={s.correlations}
          correlationError={s.correlationError}
          selectedPoint={s.selectedPoint}
          rebalanceFrequency={s.rebalanceFrequency}
          allowCash={s.allowCash}
          returnObjective={s.returnObjective}
          solver={s.solver}
          onSelectPoint={s.setSelectedPoint}
          onLoadInBacktester={s.handleLoadInBacktester}
        />
      )}
    </div>
  );
}
