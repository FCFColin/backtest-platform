/**
 * @file 目标优化器页面
 * @description 基于蒙特卡洛模拟计算达成财务目标的概率，展示概率分布、最优路径与建议配置
 * @route /goal-optimizer
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, X } from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { GoalOptimizerResult } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';

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

function fmtPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

// ===== 主页面 =====

export default function GoalOptimizerPage() {
  const [targetAmount, setTargetAmount] = useState(1000000);
  const [initialAmount, setInitialAmount] = useState(100000);
  const [years, setYears] = useState(20);
  const [assets, setAssets] = useState<Array<{ ticker: string; weight: number }>>([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const [maxDrawdown, setMaxDrawdown] = useState<number | ''>('');
  const [minSuccessRate, setMinSuccessRate] = useState<number | ''>('');
  const [maxVolatility, setMaxVolatility] = useState<number | ''>('');
  const [numSimulations, setNumSimulations] = useState(1000);
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<GoalOptimizerResult | null>(null);

  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (idx: number) => {
    if (assets.length > 1) setAssets(assets.filter((_, i) => i !== idx));
  };
  const updateAsset = (idx: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[idx] = { ...next[idx], [field]: val };
    setAssets(next);
  };

  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  const runOptimize = () => {
    const validAssets = assets.filter((a) => a.ticker.trim());
    if (validAssets.length === 0) {
      setError('请至少添加一个标的');
      return;
    }
    if (totalWeight !== 100) {
      setError('权重合计必须为 100%');
      return;
    }
    if (targetAmount <= 0 || initialAmount <= 0 || years <= 0) {
      setError('目标金额、初始金额、时间范围必须为正数');
      return;
    }

    run(async () => {
      const constraints: { maxDrawdown?: number; minSuccessRate?: number; maxVolatility?: number } = {};
      if (maxDrawdown !== '') constraints.maxDrawdown = maxDrawdown / 100;
      if (minSuccessRate !== '') constraints.minSuccessRate = minSuccessRate / 100;
      if (maxVolatility !== '') constraints.maxVolatility = maxVolatility / 100;

      const res = await fetch('/api/goal-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount,
          initialAmount,
          years,
          assets: validAssets,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
          numSimulations,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || '目标优化失败');
      setResults(json.data);
    });
  };

  // 成功概率颜色：≥70% 绿、≥40% 橙、<40% 红
  const probColor = results
    ? results.successProbability >= 0.7
      ? 'var(--success)'
      : results.successProbability >= 0.4
        ? CHART_COLORS[1]
        : 'var(--error)'
    : 'var(--text-strong)';

  // ===== 左侧参数面板 =====
  const paramsPanel = (
    <ParamsPanel>
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
                onChange={(e) => setTargetAmount(Number(e.target.value))}
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
                onChange={(e) => setInitialAmount(Number(e.target.value))}
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
                onChange={(e) => setYears(Number(e.target.value))}
                min={1}
              />
              <span className="param-input-suffix">年</span>
            </div>
          </div>
        </div>
      </ParamsSection>

      <ParamsSection title="资产配置" info="添加标的与权重，权重合计需为 100%">
        <div className="portfolios-cards">
          <div className="portfolio-card">
            {assets.map((a, idx) => (
              <div key={idx} className="ticker-row">
                <input
                  type="text"
                  value={a.ticker}
                  onChange={(e) => updateAsset(idx, 'ticker', e.target.value)}
                  placeholder="输入代码，如 VTI"
                  className="ticker-input"
                />
                <div className="weight-cell">
                  <input
                    type="number"
                    value={a.weight || ''}
                    onChange={(e) => updateAsset(idx, 'weight', Number(e.target.value))}
                    min={0}
                    max={100}
                    className="weight-input"
                    placeholder="%"
                  />
                  <span className="weight-suffix">%</span>
                </div>
                {assets.length > 1 && (
                  <button onClick={() => removeAsset(idx)} className="row-remove-btn" title="删除">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <button className="portfolios-add-btn" onClick={addAsset} style={{ marginTop: 8 }}>
          <Plus className="w-4 h-4" />
          添加标的
        </button>
        <div className={`portfolio-total ${totalWeight === 100 ? 'complete' : 'incomplete'}`} style={{ marginTop: 8 }}>
          <span>合计</span>
          <span className="total-value">{totalWeight}%</span>
        </div>
      </ParamsSection>

      <ParamsSection
        title="约束条件"
        info="可选：设置最大回撤、最小成功率、最大波动率约束，模拟将过滤不满足最大回撤与最大波动率约束的路径"
        defaultOpen={false}
      >
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">最大回撤限制</span>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={maxDrawdown}
                onChange={(e) => setMaxDrawdown(e.target.value === '' ? '' : Number(e.target.value))}
                min={0}
                max={100}
                placeholder="不限"
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field">
            <span className="param-label">最小成功率</span>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={minSuccessRate}
                onChange={(e) => setMinSuccessRate(e.target.value === '' ? '' : Number(e.target.value))}
                min={0}
                max={100}
                placeholder="不限"
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
          <div className="param-field">
            <span className="param-label">最大波动率</span>
            <div className="param-input-suffix-wrap">
              <input
                type="number"
                className="param-input param-input-with-suffix"
                value={maxVolatility}
                onChange={(e) => setMaxVolatility(e.target.value === '' ? '' : Number(e.target.value))}
                min={0}
                max={100}
                placeholder="不限"
              />
              <span className="param-input-suffix">%</span>
            </div>
          </div>
        </div>
      </ParamsSection>

      <ParamsSection title="模拟参数" info="蒙特卡洛模拟次数，越多越精确但耗时越长（默认 1000，上限 10000）">
        <div className="param-field">
          <span className="param-label">模拟次数</span>
          <input
            type="number"
            className="param-input"
            value={numSimulations}
            onChange={(e) => setNumSimulations(Number(e.target.value))}
            min={100}
            max={10000}
          />
        </div>
      </ParamsSection>

      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runOptimize} loadingText="优化中...">
          <Play className="w-4 h-4" />
          开始优化
        </LoadingButton>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const resultsPanel = (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          优化失败：{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          {/* 成功概率卡片 */}
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              达成目标概率
            </div>
            <div style={{ fontSize: 48, fontWeight: 700, fontFamily: 'monospace', color: probColor, lineHeight: 1.2 }}>
              {(results.successProbability * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              目标 {fmtDollar(targetAmount)} · 初始 {fmtDollar(initialAmount)} · {years} 年
            </div>
          </div>

          {/* 概率分布曲线 */}
          <div className="chart-card">
            <div className="chart-card-title">终值概率分布</div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={results.probabilityCurve} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
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
                <Area type="monotone" dataKey="probability" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} name="概率" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 最优路径图 */}
          <div className="chart-card">
            <div className="chart-card-title">最优路径（中位数 / P10 / P90）</div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={results.optimalPath} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
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
                <ReferenceLine y={targetAmount} stroke={CHART_COLORS[3]} strokeDasharray="4 2" label={{ value: '目标', fill: CHART_COLORS[3], fontSize: 11, position: 'insideTopRight' }} />
                <Line type="monotone" dataKey="p90" stroke={CHART_COLORS[2]} strokeWidth={1.5} dot={false} name="P90" />
                <Line type="monotone" dataKey="median" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} name="中位数" />
                <Line type="monotone" dataKey="p10" stroke={CHART_COLORS[3]} strokeWidth={1.5} dot={false} name="P10" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 建议配置卡片 */}
          <div className="chart-card">
            <div className="chart-card-title">建议配置</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ textAlign: 'center', padding: 16, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>预期年化收益</div>
                <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-strong)' }}>
                  {fmtPct(results.recommendation.expectedReturn)}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>所需定期投入（年）</div>
                <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-strong)' }}>
                  {fmtDollar(results.recommendation.requiredContribution)}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ fontSize: 11, marginBottom: 6, color: 'var(--text-muted)' }}>成功率</div>
                <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'monospace', color: probColor }}>
                  {fmtPct(results.recommendation.successRate)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!results && !error && !isLoading && (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
          设置目标与资产配置后点击「开始优化」查看结果
        </div>
      )}
    </div>
  );

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">目标优化器</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          目标优化器基于历史收益分布进行蒙特卡洛模拟，计算您达成财务目标的概率，并给出建议的资产配置与定期投入方案。
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">可分析内容</div>
            <div className="bt-seo-feature-desc">设定目标金额、初始资金与时间范围，基于资产配置的历史收益特征模拟数千条未来路径。</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">输出结果</div>
            <div className="bt-seo-feature-desc">达成目标的成功概率、终值概率分布曲线、中位数/P10/P90 最优路径、预期收益与所需定期投入。</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">相关工具：</span>
          <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>蒙特卡洛模拟</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>有效前沿</Link>
        </div>
      </div>

      <ToolPageLayout title="目标优化参数" params={paramsPanel} results={resultsPanel} />
    </div>
  );
}
