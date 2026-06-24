/**
 * @file 战术网格搜索（Tactical Grid Search）页面
 * @description 遍历信号参数网格（周期 × 阈值），对每个参数组合运行回测，
 *              通过热力图直观展示参数组合表现，并给出 Top N 最优参数组合。
 * @route /tactical-grid
 */
import { useState } from 'react';
import { Play } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { RebalanceFrequency } from '../../shared/types';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import LoadingButton from '../components/LoadingButton';
import { SortableTable, type Column } from '../components/SortableTable';
import { useAsyncAction } from '../hooks/useAsyncAction';

// ===== 常量 =====

type IndicatorType = 'sma' | 'ema' | 'rsi';
type ObjectiveType = 'maxCAGR' | 'minDrawdown' | 'maxSharpe';

const INDICATOR_OPTIONS: Array<{ value: IndicatorType; label: string }> = [
  { value: 'sma', label: 'SMA 简单均线' },
  { value: 'ema', label: 'EMA 指数均线' },
  { value: 'rsi', label: 'RSI 相对强弱' },
];

const REBALANCE_OPTIONS: Array<{ value: RebalanceFrequency; label: string }> = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'quarterly', label: '每季' },
  { value: 'annual', label: '每年' },
];

const OBJECTIVE_OPTIONS: Array<{ value: ObjectiveType; label: string }> = [
  { value: 'maxCAGR', label: '最大化 CAGR（年化收益）' },
  { value: 'minDrawdown', label: '最小化最大回撤' },
  { value: 'maxSharpe', label: '最大化 Sharpe（夏普比率）' },
];

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

// ===== 类型定义 =====

interface ParamRange {
  min: number;
  max: number;
  step: number;
}

interface GridCombinationMetrics {
  param1: number;
  param2: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  totalReturn: number;
  stdev: number;
  calmar: number;
}

interface TopCombinationResult extends GridCombinationMetrics {
  growthCurve: Array<{ date: string; value: number }>;
}

interface HeatmapData {
  param1Label: string;
  param2Label: string;
  param1Values: number[];
  param2Values: number[];
  matrix: (number | null)[][];
  objective: ObjectiveType;
}

interface TacticalGridResponse {
  totalCombinations: number;
  allMetrics: GridCombinationMetrics[];
  topResults: TopCombinationResult[];
  heatmap: HeatmapData;
  bestCombination: TopCombinationResult;
}

// ===== 工具函数 =====

function fmtPct(v: number | undefined | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtRatio(v: number | undefined | null): string {
  if (v == null) return '—';
  return v.toFixed(3);
}

function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v == null) return '—';
  return v.toFixed(digits);
}

/** 根据指标类型返回参数标签 */
function getParamLabels(indicator: IndicatorType): { p1: string; p2: string } {
  if (indicator === 'rsi') {
    return { p1: 'RSI 周期', p2: '超卖阈值' };
  }
  return { p1: `${indicator.toUpperCase()} 周期`, p2: '突破阈值(%)' };
}

/** 热力图颜色：红 → 黄 → 绿，value 越大越绿 */
function getHeatmapColor(value: number, min: number, max: number): string {
  if (min === max) return 'hsl(60, 70%, 50%)';
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = normalized * 120; // 0=红, 60=黄, 120=绿
  return `hsl(${hue}, 70%, 45%)`;
}

/** 热力图文字颜色：深色背景用白字，浅色背景用黑字 */
function getHeatmapTextColor(value: number, min: number, max: number): string {
  if (min === max) return '#000';
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return normalized > 0.5 ? '#fff' : '#000';
}

// ===== 主页面 =====

export default function TacticalGridPage() {
  // 信号参数
  const [indicator, setIndicator] = useState<IndicatorType>('sma');
  const [param1, setParam1] = useState<ParamRange>({ min: 10, max: 50, step: 5 });
  const [param2, setParam2] = useState<ParamRange>({ min: 0, max: 5, step: 1 });

  // 回测参数
  const [ticker, setTicker] = useState('SPY');
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [startingValue, setStartingValue] = useState(10000);
  const [rebalanceFrequency, setRebalanceFrequency] = useState<RebalanceFrequency>('daily');

  // 优化目标
  const [objective, setObjective] = useState<ObjectiveType>('maxSharpe');

  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<TacticalGridResponse | null>(null);

  const paramLabels = getParamLabels(indicator);

  const runSearch = () => {
    const trimmedTicker = ticker.trim().toUpperCase();
    if (!trimmedTicker) {
      setError('请输入标的代码');
      return;
    }
    if (param1.step <= 0 || param2.step <= 0) {
      setError('步长必须大于 0');
      return;
    }
    if (param1.min > param1.max || param2.min > param2.max) {
      setError('参数最小值不能大于最大值');
      return;
    }
    const totalCombinations =
      Math.floor((param1.max - param1.min) / param1.step + 1) *
      Math.floor((param2.max - param2.min) / param2.step + 1);
    if (totalCombinations > 500) {
      setError(`参数组合过多(${totalCombinations})，请缩小范围（上限500）`);
      return;
    }

    run(async () => {
      const reqBody = {
        indicator,
        param1,
        param2,
        tickers: [trimmedTicker],
        startDate,
        endDate,
        startingValue,
        rebalanceFrequency,
        objective,
        topN: 10,
      };
      const res = await fetch('/api/tactical-grid/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '网格搜索失败');
      setResults(json.data as TacticalGridResponse);
    });
  };

  // ===== Top 组合表格列定义 =====
  // 为每行附加 rank 字段（基于已排序的顺序）
  const topResultsWithRank = (results?.topResults ?? []).map((r, i) => ({ ...r, rank: i + 1 }));
  const topColumns: Column<typeof topResultsWithRank[number]>[] = [
    {
      key: 'rank',
      label: '#',
      sortValue: (r) => r.rank,
    },
    {
      key: 'param1',
      label: paramLabels.p1,
      sortValue: (r) => r.param1,
    },
    {
      key: 'param2',
      label: paramLabels.p2,
      sortValue: (r) => r.param2,
    },
    {
      key: 'cagr',
      label: 'CAGR',
      render: (r) => fmtPct(r.cagr),
      sortValue: (r) => r.cagr,
    },
    {
      key: 'maxDrawdown',
      label: '最大回撤',
      render: (r) => fmtPct(r.maxDrawdown),
      sortValue: (r) => r.maxDrawdown,
    },
    {
      key: 'sharpe',
      label: 'Sharpe',
      render: (r) => fmtRatio(r.sharpe),
      sortValue: (r) => r.sharpe,
    },
    {
      key: 'stdev',
      label: '波动率',
      render: (r) => fmtPct(r.stdev),
      sortValue: (r) => r.stdev,
    },
    {
      key: 'calmar',
      label: 'Calmar',
      render: (r) => fmtRatio(r.calmar),
      sortValue: (r) => r.calmar,
    },
    {
      key: 'totalReturn',
      label: '累计收益',
      render: (r) => fmtPct(r.totalReturn),
      sortValue: (r) => r.totalReturn,
    },
  ];

  // ===== 左侧参数面板 =====
  const paramsPanel = (
    <ParamsPanel>
      <ParamsSection
        title="信号参数网格"
        info="选择技术指标与参数范围，系统将遍历所有参数组合（笛卡尔积）寻找最优信号参数"
      >
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">技术指标</span>
          <select
            className="param-input"
            value={indicator}
            onChange={(e) => setIndicator(e.target.value as IndicatorType)}
          >
            {INDICATOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 参数 1 范围 */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
          {paramLabels.p1}
        </div>
        <div className="params-row" style={{ marginBottom: 8 }}>
          <div className="param-field">
            <span className="param-label">最小</span>
            <input
              type="number"
              className="param-input"
              value={param1.min}
              min={1}
              onChange={(e) => setParam1({ ...param1, min: Number(e.target.value) })}
            />
          </div>
          <div className="param-field">
            <span className="param-label">最大</span>
            <input
              type="number"
              className="param-input"
              value={param1.max}
              min={1}
              onChange={(e) => setParam1({ ...param1, max: Number(e.target.value) })}
            />
          </div>
          <div className="param-field">
            <span className="param-label">步长</span>
            <input
              type="number"
              className="param-input"
              value={param1.step}
              min={0.1}
              step={0.5}
              onChange={(e) => setParam1({ ...param1, step: Number(e.target.value) })}
            />
          </div>
        </div>

        {/* 参数 2 范围 */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>
          {paramLabels.p2}
        </div>
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">最小</span>
            <input
              type="number"
              className="param-input"
              value={param2.min}
              onChange={(e) => setParam2({ ...param2, min: Number(e.target.value) })}
            />
          </div>
          <div className="param-field">
            <span className="param-label">最大</span>
            <input
              type="number"
              className="param-input"
              value={param2.max}
              onChange={(e) => setParam2({ ...param2, max: Number(e.target.value) })}
            />
          </div>
          <div className="param-field">
            <span className="param-label">步长</span>
            <input
              type="number"
              className="param-input"
              value={param2.step}
              min={0.1}
              step={0.5}
              onChange={(e) => setParam2({ ...param2, step: Number(e.target.value) })}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          {indicator === 'rsi'
            ? 'RSI 低于超卖阈值时入场，高于 100-阈值 时离场'
            : `价格突破均线±阈值% 时入场，跌破均线∓阈值% 时离场`}
        </div>
      </ParamsSection>

      <ParamsSection title="回测参数" info="设置交易标的、时间范围、初始资金与再平衡频率">
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">标的代码</span>
          <input
            type="text"
            className="param-input"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="如 SPY"
          />
        </div>
        <div className="params-row" style={{ marginBottom: 8 }}>
          <div className="param-field">
            <span className="param-label">开始日期</span>
            <input
              type="date"
              className="param-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="param-field">
            <span className="param-label">结束日期</span>
            <input
              type="date"
              className="param-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">初始资金</span>
            <input
              type="number"
              className="param-input"
              value={startingValue}
              min={100}
              onChange={(e) => setStartingValue(Number(e.target.value))}
            />
          </div>
          <div className="param-field">
            <span className="param-label">再平衡频率</span>
            <select
              className="param-input"
              value={rebalanceFrequency}
              onChange={(e) => setRebalanceFrequency(e.target.value as RebalanceFrequency)}
            >
              {REBALANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </ParamsSection>

      <ParamsSection title="优化目标" info="选择用于排序参数组合的优化目标">
        <div className="param-field">
          <span className="param-label">目标</span>
          <select
            className="param-input"
            value={objective}
            onChange={(e) => setObjective(e.target.value as ObjectiveType)}
          >
            {OBJECTIVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </ParamsSection>

      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runSearch} loadingText="搜索中...">
          <Play className="w-4 h-4" />
          开始网格搜索
        </LoadingButton>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const resultsPanel = (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          搜索失败：{error}
        </div>
      )}

      {results && (
        <>
          {/* 概要信息 */}
          <div className="card" style={{ padding: 12, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>参数组合数</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-strong)', marginLeft: 6 }}>
                {results.totalCombinations}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>最优 {paramLabels.p1}</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--brand)', marginLeft: 6 }}>
                {results.bestCombination.param1}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>最优 {paramLabels.p2}</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--brand)', marginLeft: 6 }}>
                {results.bestCombination.param2}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>最优 CAGR</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--success)', marginLeft: 6 }}>
                {fmtPct(results.bestCombination.cagr)}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>最优 Sharpe</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--success)', marginLeft: 6 }}>
                {fmtRatio(results.bestCombination.sharpe)}
              </span>
            </div>
          </div>

          {/* 热力图 */}
          {results.heatmap.matrix.length > 0 && (
            <div className="chart-card">
              <div className="chart-card-title">
                参数热力图（{results.heatmap.param1Label} × {results.heatmap.param2Label}）
              </div>
              <HeatmapView heatmap={results.heatmap} />
            </div>
          )}

          {/* Top 10 参数组合表 */}
          <div className="chart-card">
            <div className="chart-card-title">Top {results.topResults.length} 参数组合</div>
            <SortableTable
              columns={topColumns}
              data={topResultsWithRank}
              initialSortKey="rank"
              initialSortDir="asc"
            />
          </div>

          {/* 最优组合收益曲线 */}
          {results.bestCombination.growthCurve.length > 0 && (
            <div className="chart-card">
              <div className="chart-card-title">
                最优组合收益曲线（{paramLabels.p1}={results.bestCombination.param1}, {paramLabels.p2}={results.bestCombination.param2}）
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart
                  data={results.bestCombination.growthCurve}
                  margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickFormatter={(v: string) => v.slice(0, 7)}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(label: string) => `日期: ${label}`}
                    formatter={(value: number) => [`$${value.toLocaleString()}`, '净值']}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    name="组合净值"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {!results && !error && !isLoading && (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
          设置左侧参数后点击「开始网格搜索」查看结果
        </div>
      )}
    </div>
  );

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">战术网格搜索</h1>
      </div>
      <ToolPageLayout title="参数设置" params={paramsPanel} results={resultsPanel} />
    </div>
  );
}

// ===== 热力图子组件 =====

function HeatmapView({ heatmap }: { heatmap: HeatmapData }) {
  const { param1Values, param2Values, matrix } = heatmap;

  // 计算矩阵中的最小值与最大值（用于颜色映射）
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const row of matrix) {
    for (const cell of row) {
      if (cell != null) {
        if (cell < minVal) minVal = cell;
        if (cell > maxVal) maxVal = cell;
      }
    }
  }
  if (minVal === Infinity) minVal = 0;
  if (maxVal === -Infinity) maxVal = 0;

  const objectiveLabel =
    heatmap.objective === 'maxCAGR'
      ? 'CAGR'
      : heatmap.objective === 'minDrawdown'
        ? '回撤(负值)'
        : 'Sharpe';

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, margin: '8px 0' }}>
        <thead>
          <tr>
            <th
              style={{
                padding: '6px 8px',
                color: 'var(--text-muted)',
                borderBottom: '2px solid var(--border-soft)',
                borderRight: '1px solid var(--border-soft)',
                fontSize: 11,
                fontWeight: 600,
                position: 'sticky',
                top: 0,
                background: 'var(--bg-elevated)',
                zIndex: 1,
              }}
            >
              {heatmap.param1Label} \ {heatmap.param2Label}
            </th>
            {param2Values.map((p2) => (
              <th
                key={p2}
                style={{
                  padding: '6px 8px',
                  color: 'var(--text-muted)',
                  borderBottom: '2px solid var(--border-soft)',
                  borderRight: '1px solid var(--border-soft)',
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 56,
                  position: 'sticky',
                  top: 0,
                  background: 'var(--bg-elevated)',
                  zIndex: 1,
                }}
              >
                {p2}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {param1Values.map((p1, i) => (
            <tr key={p1}>
              <td
                style={{
                  padding: '6px 8px',
                  color: 'var(--text-strong)',
                  fontWeight: 600,
                  borderBottom: '1px solid var(--border-soft)',
                  borderRight: '1px solid var(--border-soft)',
                  background: 'var(--bg-subtle)',
                  fontSize: 11,
                }}
              >
                {p1}
              </td>
              {param2Values.map((p2, j) => {
                const cell = matrix[i]?.[j];
                if (cell == null) {
                  return (
                    <td
                      key={p2}
                      style={{
                        padding: '6px 8px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--border-soft)',
                        borderRight: '1px solid var(--border-soft)',
                        fontSize: 11,
                      }}
                    >
                      —
                    </td>
                  );
                }
                const bg = getHeatmapColor(cell, minVal, maxVal);
                const fg = getHeatmapTextColor(cell, minVal, maxVal);
                const displayVal =
                  heatmap.objective === 'minDrawdown'
                    ? fmtPct(-cell)
                    : heatmap.objective === 'maxCAGR'
                      ? fmtPct(cell)
                      : fmtNum(cell, 2);
                return (
                  <td
                    key={p2}
                    title={`${heatmap.param1Label}=${p1}, ${heatmap.param2Label}=${p2}\n${objectiveLabel}: ${displayVal}`}
                    style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      backgroundColor: bg,
                      color: fg,
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border-soft)',
                      borderRight: '1px solid var(--border-soft)',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      cursor: 'default',
                    }}
                  >
                    {displayVal}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* 图例 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>{objectiveLabel} 低</span>
        <div
          style={{
            width: 120,
            height: 12,
            borderRadius: 2,
            background: 'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))',
          }}
        />
        <span>{objectiveLabel} 高</span>
      </div>
    </div>
  );
}
