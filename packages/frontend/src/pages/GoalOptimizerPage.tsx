/**
 * @file 目标优化器页面
 * @description 基于蒙特卡洛模拟计算达成财务目标的概率，展示概率分布、最优路径与建议配置
 * @route /goal-optimizer
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, X } from 'lucide-react';
import { fmtPct } from '@/utils/format';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { GoalOptimizerResult } from '@backtest/shared';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import LoadingButton from '../components/LoadingButton.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout.js';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel.js';

// ===== 工具函数 =====

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

function fmtDollar(v: number): string {
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function getProbColor(prob: number | undefined): string {
  if (prob === undefined) return 'var(--text-strong)';
  if (prob >= 0.7) return 'var(--success)';
  if (prob >= 0.4) return CHART_COLORS[1];
  return 'var(--error)';
}

interface GoalAsset {
  ticker: string;
  weight: number;
}

// ===== 参数面板 =====
interface GoalParamsProps {
  targetAmount: number;
  initialAmount: number;
  years: number;
  assets: GoalAsset[];
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
  totalWeight: number;
  isLoading: boolean;
  onTargetAmountChange: (v: number) => void;
  onInitialAmountChange: (v: number) => void;
  onYearsChange: (v: number) => void;
  onAddAsset: () => void;
  onRemoveAsset: (idx: number) => void;
  onUpdateAsset: (idx: number, field: 'ticker' | 'weight', val: string | number) => void;
  onMaxDrawdownChange: (v: number | '') => void;
  onMinSuccessRateChange: (v: number | '') => void;
  onMaxVolatilityChange: (v: number | '') => void;
  onNumSimulationsChange: (v: number) => void;
  onRun: () => void;
}

/** 约束条件 + 模拟参数区域 */
interface ConstraintsProps {
  maxDrawdown: number | '';
  minSuccessRate: number | '';
  maxVolatility: number | '';
  numSimulations: number;
  onMaxDrawdownChange: (v: number | '') => void;
  onMinSuccessRateChange: (v: number | '') => void;
  onMaxVolatilityChange: (v: number | '') => void;
  onNumSimulationsChange: (v: number) => void;
}

function ConstraintField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  return (
    <div className="param-field">
      <span className="param-label">{label}</span>
      <div className="param-input-suffix-wrap">
        <input
          type="number"
          className="param-input param-input-with-suffix"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          min={0}
          max={100}
          placeholder="不限"
        />
        <span className="param-input-suffix">%</span>
      </div>
    </div>
  );
}

function ConstraintsAndSimulation({
  maxDrawdown,
  minSuccessRate,
  maxVolatility,
  numSimulations,
  onMaxDrawdownChange,
  onMinSuccessRateChange,
  onMaxVolatilityChange,
  onNumSimulationsChange,
}: ConstraintsProps) {
  return (
    <>
      <ParamsSection
        title="约束条件"
        info="可选：设置最大回撤、最小成功率、最大波动率约束，模拟将过滤不满足最大回撤与最大波动率约束的路径"
        defaultOpen={false}
      >
        <div className="params-row">
          <ConstraintField
            label="最大回撤限制"
            value={maxDrawdown}
            onChange={onMaxDrawdownChange}
          />
          <ConstraintField
            label="最小成功率"
            value={minSuccessRate}
            onChange={onMinSuccessRateChange}
          />
          <ConstraintField
            label="最大波动率"
            value={maxVolatility}
            onChange={onMaxVolatilityChange}
          />
        </div>
      </ParamsSection>
      <ParamsSection
        title="模拟参数"
        info="蒙特卡洛模拟次数，越多越精确但耗时越长（默认 1000，上限 10000）"
      >
        <div className="param-field">
          <span className="param-label">模拟次数</span>
          <input
            type="number"
            className="param-input"
            value={numSimulations}
            onChange={(e) => onNumSimulationsChange(Number(e.target.value))}
            min={100}
            max={10000}
          />
        </div>
      </ParamsSection>
    </>
  );
}

function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  onTargetAmountChange,
  onInitialAmountChange,
  onYearsChange,
}: Pick<
  GoalParamsProps,
  | 'targetAmount'
  | 'initialAmount'
  | 'years'
  | 'onTargetAmountChange'
  | 'onInitialAmountChange'
  | 'onYearsChange'
>) {
  return (
    <ParamsSection title="目标设置" info="设定您的财务目标：目标金额、初始金额与投资时间范围">
      <div className="params-row">
        <div className="param-field">
          <span className="param-label">目标金额</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={targetAmount}
              onChange={(e) => onTargetAmountChange(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
        <div className="param-field">
          <span className="param-label">初始金额</span>
          <div className="param-input-prefix-wrap">
            <span className="param-input-prefix">$</span>
            <input
              type="number"
              className="param-input param-input-with-prefix"
              value={initialAmount}
              onChange={(e) => onInitialAmountChange(Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
        <div className="param-field">
          <span className="param-label">时间范围</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              className="param-input param-input-with-suffix"
              value={years}
              onChange={(e) => onYearsChange(Number(e.target.value))}
              min={1}
            />
            <span className="param-input-suffix">年</span>
          </div>
        </div>
      </div>
    </ParamsSection>
  );
}

function AssetConfigSection({
  assets,
  totalWeight,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
}: Pick<
  GoalParamsProps,
  'assets' | 'totalWeight' | 'onAddAsset' | 'onRemoveAsset' | 'onUpdateAsset'
>) {
  return (
    <ParamsSection title="资产配置" info="添加标的与权重，权重合计需为 100%">
      <div className="portfolios-cards">
        <div className="portfolio-card">
          {assets.map((a, idx) => (
            <div key={idx} className="ticker-row">
              <input
                type="text"
                value={a.ticker}
                onChange={(e) => onUpdateAsset(idx, 'ticker', e.target.value)}
                placeholder="输入代码，如 VTI"
                className="ticker-input"
              />
              <div className="weight-cell">
                <input
                  type="number"
                  value={a.weight || ''}
                  onChange={(e) => onUpdateAsset(idx, 'weight', Number(e.target.value))}
                  min={0}
                  max={100}
                  className="weight-input"
                  placeholder="%"
                />
                <span className="weight-suffix">%</span>
              </div>
              {assets.length > 1 && (
                <button onClick={() => onRemoveAsset(idx)} className="row-remove-btn" title="删除">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <button className="portfolios-add-btn" onClick={onAddAsset} style={{ marginTop: 8 }}>
        <Plus className="w-4 h-4" />
        添加标的
      </button>
      <div
        className={`portfolio-total ${totalWeight === 100 ? 'complete' : 'incomplete'}`}
        style={{ marginTop: 8 }}
      >
        <span>合计</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </ParamsSection>
  );
}

function GoalOptimizerParamsPanel(props: GoalParamsProps) {
  return (
    <ParamsPanel>
      <GoalSettingsSection {...props} />
      <AssetConfigSection {...props} />
      <ConstraintsAndSimulation
        maxDrawdown={props.maxDrawdown}
        minSuccessRate={props.minSuccessRate}
        maxVolatility={props.maxVolatility}
        numSimulations={props.numSimulations}
        onMaxDrawdownChange={props.onMaxDrawdownChange}
        onMinSuccessRateChange={props.onMinSuccessRateChange}
        onMaxVolatilityChange={props.onMaxVolatilityChange}
        onNumSimulationsChange={props.onNumSimulationsChange}
      />
      <div className="bt-action-row">
        <LoadingButton isLoading={props.isLoading} onClick={props.onRun} loadingText="优化中...">
          <Play className="w-4 h-4" />
          开始优化
        </LoadingButton>
      </div>
    </ParamsPanel>
  );
}

// ===== 结果面板 =====
interface GoalResultsProps {
  results: GoalOptimizerResult | null;
  error: string | null;
  isLoading: boolean;
  targetAmount: number;
  initialAmount: number;
  years: number;
}

/** 概率分布图 */
function ProbabilityDistributionChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['probabilityCurve'];
  targetAmount: number;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">终值概率分布</div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="amount"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, '概率']}
            labelFormatter={(v: number) => fmtDollar(v)}
          />
          <ReferenceLine
            x={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{ value: '目标', position: 'top', fill: CHART_COLORS[3], fontSize: 11 }}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.3}
            name="概率"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 最优路径图 */
function OptimalPathChart({
  data,
  targetAmount,
}: {
  data: GoalOptimizerResult['optimalPath'];
  targetAmount: number;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">最优路径（中位数 / P10 / P90）</div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="year"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `${v}y`}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => fmtDollar(v)}
            labelFormatter={(v: number) => `第 ${v} 年`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
          <ReferenceLine
            y={targetAmount}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: '目标',
              fill: CHART_COLORS[3],
              fontSize: 11,
              position: 'insideTopRight',
            }}
          />
          <Line
            type="monotone"
            dataKey="p90"
            stroke={CHART_COLORS[2]}
            strokeWidth={1.5}
            dot={false}
            name="P90"
          />
          <Line
            type="monotone"
            dataKey="median"
            stroke={CHART_COLORS[0]}
            strokeWidth={2.5}
            dot={false}
            name="中位数"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke={CHART_COLORS[3]}
            strokeWidth={1.5}
            dot={false}
            name="P10"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 建议配置卡片 */
function RecommendationCards({
  recommendation,
  probColor,
}: {
  recommendation: GoalOptimizerResult['recommendation'];
  probColor: string;
}) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">建议配置</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>
            预期年化收益
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-strong)',
            }}
          >
            {fmtPct(recommendation.expectedReturn)}
          </div>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>
            所需定期投入（年）
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-strong)',
            }}
          >
            {fmtDollar(recommendation.requiredContribution)}
          </div>
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>成功率</div>
          <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'monospace', color: probColor }}>
            {fmtPct(recommendation.successRate)}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoalOptimizerResultsPanel({
  results,
  error,
  isLoading,
  targetAmount,
  initialAmount,
  years,
}: GoalResultsProps) {
  const probColor = getProbColor(results?.successProbability);

  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          优化失败：{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              达成目标概率
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                fontFamily: 'monospace',
                color: probColor,
                lineHeight: 1.2,
              }}
            >
              {(results.successProbability * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              目标 {fmtDollar(targetAmount)} · 初始 {fmtDollar(initialAmount)} · {years} 年
            </div>
          </div>
          <ProbabilityDistributionChart
            data={results.probabilityCurve}
            targetAmount={targetAmount}
          />
          <OptimalPathChart data={results.optimalPath} targetAmount={targetAmount} />
          <RecommendationCards recommendation={results.recommendation} probColor={probColor} />
        </div>
      )}

      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          设置目标与资产配置后点击「开始优化」查看结果
        </div>
      )}
    </div>
  );
}

/** SEO 卡片 */
function GoalOptimizerSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        目标优化器基于历史收益分布进行蒙特卡洛模拟，计算您达成财务目标的概率，并给出建议的资产配置与定期投入方案。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可分析内容</div>
          <div className="bt-seo-feature-desc">
            设定目标金额、初始资金与时间范围，基于资产配置的历史收益特征模拟数千条未来路径。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">输出结果</div>
          <div className="bt-seo-feature-desc">
            达成目标的成功概率、终值概率分布曲线、中位数/P10/P90 最优路径、预期收益与所需定期投入。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛模拟
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
          有效前沿
        </Link>
      </div>
    </div>
  );
}

// ===== 主页面 =====
function validateGoalInputs(
  validAssets: GoalAsset[],
  totalWeight: number,
  targetAmount: number,
  initialAmount: number,
  years: number,
): string | null {
  if (validAssets.length === 0) return '请至少添加一个标的';
  if (totalWeight !== 100) return '权重合计必须为 100%';
  if (targetAmount <= 0 || initialAmount <= 0 || years <= 0)
    return '目标金额、初始金额、时间范围必须为正数';
  return null;
}

function useGoalOptimizerStateInner() {
  const [targetAmount, setTargetAmount] = useState(1000000);
  const [initialAmount, setInitialAmount] = useState(100000);
  const [years, setYears] = useState(20);
  const [assets, setAssets] = useState<GoalAsset[]>([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const [maxDrawdown, setMaxDrawdown] = useState<number | ''>('');
  const [minSuccessRate, setMinSuccessRate] = useState<number | ''>('');
  const [maxVolatility, setMaxVolatility] = useState<number | ''>('');
  const [numSimulations, setNumSimulations] = useState(1000);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<GoalOptimizerResult | null>(null);
  return {
    targetAmount,
    setTargetAmount,
    initialAmount,
    setInitialAmount,
    years,
    setYears,
    assets,
    setAssets,
    maxDrawdown,
    setMaxDrawdown,
    minSuccessRate,
    setMinSuccessRate,
    maxVolatility,
    setMaxVolatility,
    numSimulations,
    setNumSimulations,
    isLoading,
    error,
    run,
    setError,
    results,
    setResults,
  };
}

function useGoalOptimizerState() {
  const s = useGoalOptimizerStateInner();

  const addAsset = () => s.setAssets([...s.assets, { ticker: '', weight: 0 }]);
  const removeAsset = (idx: number) => {
    if (s.assets.length > 1) s.setAssets(s.assets.filter((_, i) => i !== idx));
  };
  const updateAsset = (idx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...s.assets];
    next[idx] = { ...next[idx], [field]: val };
    s.setAssets(next);
  };
  const totalWeight = s.assets.reduce((sum, a) => sum + (a.weight || 0), 0);

  const runOptimize = () => {
    const validAssets = s.assets.filter((a) => a.ticker.trim());
    const err = validateGoalInputs(
      validAssets,
      totalWeight,
      s.targetAmount,
      s.initialAmount,
      s.years,
    );
    if (err) {
      s.setError(err);
      return;
    }
    s.run(async () => {
      const constraints: { maxDrawdown?: number; minSuccessRate?: number; maxVolatility?: number } =
        {};
      if (s.maxDrawdown !== '') constraints.maxDrawdown = s.maxDrawdown / 100;
      if (s.minSuccessRate !== '') constraints.minSuccessRate = s.minSuccessRate / 100;
      if (s.maxVolatility !== '') constraints.maxVolatility = s.maxVolatility / 100;
      const res = await fetch('/api/goal-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount: s.targetAmount,
          initialAmount: s.initialAmount,
          years: s.years,
          assets: validAssets,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
          numSimulations: s.numSimulations,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '目标优化失败');
      s.setResults(json.data);
    });
  };

  return { ...s, addAsset, removeAsset, updateAsset, totalWeight, runOptimize };
}

export default function GoalOptimizerPage() {
  const s = useGoalOptimizerState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">目标优化器</h1>
      </div>
      <GoalOptimizerSeoCard />
      <ToolPageLayout
        title="目标优化参数"
        params={
          <GoalOptimizerParamsPanel
            targetAmount={s.targetAmount}
            initialAmount={s.initialAmount}
            years={s.years}
            assets={s.assets}
            maxDrawdown={s.maxDrawdown}
            minSuccessRate={s.minSuccessRate}
            maxVolatility={s.maxVolatility}
            numSimulations={s.numSimulations}
            totalWeight={s.totalWeight}
            isLoading={s.isLoading}
            onTargetAmountChange={s.setTargetAmount}
            onInitialAmountChange={s.setInitialAmount}
            onYearsChange={s.setYears}
            onAddAsset={s.addAsset}
            onRemoveAsset={s.removeAsset}
            onUpdateAsset={s.updateAsset}
            onMaxDrawdownChange={s.setMaxDrawdown}
            onMinSuccessRateChange={s.setMinSuccessRate}
            onMaxVolatilityChange={s.setMaxVolatility}
            onNumSimulationsChange={s.setNumSimulations}
            onRun={s.runOptimize}
          />
        }
        results={
          <GoalOptimizerResultsPanel
            results={s.results}
            error={s.error}
            isLoading={s.isLoading}
            targetAmount={s.targetAmount}
            initialAmount={s.initialAmount}
            years={s.years}
          />
        }
      />
    </div>
  );
}
