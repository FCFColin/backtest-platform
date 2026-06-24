/**
 * @file 调仓敏感性分析页面
 * @description 对比不同调仓频率（日/周/月/季/年）对投资组合收益与风险的影响
 * @route /rebalancing-sensitivity
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Loader2, Plus, X } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell, BarChart, Bar, LineChart, Line, Legend } from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { RebalanceFrequency } from '../../shared/types';

/** 调仓频率选项 */
const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] = [
  { value: 'daily', label: '每日', color: '#2b63b8' },
  { value: 'weekly', label: '每周', color: '#06b6d4' },
  { value: 'monthly', label: '每月', color: '#2e8b57' },
  { value: 'quarterly', label: '每季度', color: '#f97316' },
  { value: 'annual', label: '每年', color: '#c94a4a' },
];

/** 单次回测结果摘要 */
interface FreqResult {
  frequency: RebalanceFrequency;
  label: string;
  color: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  growthCurve?: Array<{ date: string; value: number }>;
}

const TABS = [
  { key: 'scatter', label: 'Scatter' },
  { key: 'distributions', label: 'Distributions' },
  { key: 'offset', label: 'Offset Curves' },
  { key: 'table', label: 'Table' },
];

export default function RebalancingSensitivityPage() {
  // 参数
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState<'usd' | 'cny'>('usd');
  const [startingValue, setStartingValue] = useState(10000);

  // 调仓频率选择（多选）
  const [selectedFreqs, setSelectedFreqs] = useState<RebalanceFrequency[]>([
    'monthly', 'quarterly', 'annual',
  ]);
  const toggleFreq = (freq: RebalanceFrequency) => {
    setSelectedFreqs((prev) =>
      prev.includes(freq) ? prev.filter((f) => f !== freq) : [...prev, freq]
    );
  };

  // 偏离扫描
  const [absoluteBand, setAbsoluteBand] = useState<number | ''>('');
  const [relativeBand, setRelativeBand] = useState<number | ''>('');

  // 组合资产
  const [assets, setAssets] = useState([
    { ticker: 'VTI', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ]);
  const addAsset = () => setAssets([...assets, { ticker: '', weight: 0 }]);
  const removeAsset = (i: number) => setAssets(assets.filter((_, idx) => idx !== i));
  const updateAsset = (i: number, field: 'ticker' | 'weight', val: string | number) => {
    const next = [...assets];
    next[i] = { ...next[i], [field]: val };
    setAssets(next);
  };
  const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0);

  // 结果
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FreqResult[]>([]);
  const [activeTab, setActiveTab] = useState('scatter');

  // Offset Curves 选中的频率
  const [offsetFreq, setOffsetFreq] = useState<RebalanceFrequency>('monthly');
  // 偏移扫描结果
  const [offsetResults, setOffsetResults] = useState<Array<{ offset: number; cagr: number }>>([]);
  const [isLoadingOffset, setIsLoadingOffset] = useState(false);

  const runSensitivity = async () => {
    const validAssets = assets.filter((a) => a.ticker.trim() !== '');
    if (validAssets.length === 0) {
      setError('请至少添加一个标的');
      return;
    }
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError('权重合计必须为 100%');
      return;
    }
    if (selectedFreqs.length === 0) {
      setError('请至少选择一个调仓频率');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResults([]);
    setOffsetResults([]);

    try {
      // 并行调用每个调仓频率的回测
      const promises = selectedFreqs.map(async (freq) => {
        const opt = REBALANCE_OPTIONS.find((o) => o.value === freq);
        const label = opt?.label ?? freq;
        const color = opt?.color ?? CHART_COLORS[0];
        const body: Record<string, unknown> = {
          portfolios: [
            {
              name: label,
              assets: validAssets,
              rebalanceFrequency: freq,
              rebalanceOffset: 0,
              drag: 0,
              totalReturn: true,
            },
          ],
          parameters: {
            startDate,
            endDate,
            startingValue,
            baseCurrency,
            adjustForInflation,
            rollingWindowMonths: 12,
            benchmarkTicker: '',
            extendedWithdrawalStats: false,
            cashflowLegs: [],
            oneTimeCashflows: [],
          },
        };

        // 如果设置了偏离带，添加到组合
        if (absoluteBand !== '' || relativeBand !== '') {
          (body.portfolios as Record<string, unknown>[])[0].rebalanceBands = {
            enabled: true,
            absoluteBand: absoluteBand !== '' ? Number(absoluteBand) : undefined,
            relativeBand: relativeBand !== '' ? Number(relativeBand) : undefined,
          };
        }

        const res = await fetch('/api/backtest/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} (${label})`);
        const json = await res.json();
        if (json.success === false) throw new Error(json.error || `回测失败 (${label})`);
        const data = json.data ?? json;
        const p = data.portfolios?.[0];
        if (!p) throw new Error(`无结果 (${label})`);
        return {
          frequency: freq,
          label,
          color,
          cagr: p.statistics?.cagr ?? 0,
          stdev: p.statistics?.stdev ?? 0,
          maxDrawdown: p.statistics?.maxDrawdown ?? 0,
          sharpe: p.statistics?.sharpe ?? 0,
          sortino: p.statistics?.sortino ?? 0,
          growthCurve: p.growthCurve,
        } as FreqResult;
      });

      const allResults = await Promise.all(promises);
      // 按频率从高到低排列
      const order: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, quarterly: 3, annual: 4 };
      allResults.sort((a, b) => order[a.frequency] - order[b.frequency]);
      setResults(allResults);

      // 自动跑偏移扫描
      if (selectedFreqs.length > 0) {
        runOffsetScan(selectedFreqs[0], validAssets);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 偏移扫描
  const runOffsetScan = async (freq: RebalanceFrequency, validAssets?: typeof assets) => {
    const assetsToUse = validAssets || assets.filter((a) => a.ticker.trim() !== '');
    if (assetsToUse.length === 0) return;
    setIsLoadingOffset(true);
    setOffsetResults([]);
    try {
      const offsets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
      const promises = offsets.map(async (offset) => {
        const body = {
          portfolios: [{
            name: `offset-${offset}`,
            assets: assetsToUse,
            rebalanceFrequency: freq,
            rebalanceOffset: offset,
            drag: 0,
            totalReturn: true,
          }],
          parameters: {
            startDate,
            endDate,
            startingValue,
            baseCurrency,
            adjustForInflation,
            rollingWindowMonths: 12,
            benchmarkTicker: '',
            extendedWithdrawalStats: false,
            cashflowLegs: [],
            oneTimeCashflows: [],
          },
        };
        const res = await fetch('/api/backtest/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) return { offset, cagr: 0 };
        const json = await res.json();
        const data = json.data ?? json;
        return { offset, cagr: data.portfolios?.[0]?.statistics?.cagr ?? 0 };
      });
      const results = await Promise.all(promises);
      setOffsetResults(results);
    } catch (err) {
      setError('再平衡敏感性分析失败');
    } finally {
      setIsLoadingOffset(false);
    }
  };

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toFixed(2);

  // 散点图数据
  const scatterData = results.map((r) => ({
    volatility: r.stdev * 100,
    cagr: r.cagr * 100,
    label: r.label,
    color: r.color,
    sharpe: r.sharpe,
    maxDrawdown: r.maxDrawdown * 100,
    sortino: r.sortino,
  }));

  // 分布图数据：按频率分组显示CAGR
  const distributionData = results.map((r) => ({
    name: r.label,
    CAGR: Number((r.cagr * 100).toFixed(2)),
    '最大回撤': Number((r.maxDrawdown * 100).toFixed(2)),
    '夏普比率': Number(r.sharpe.toFixed(2)),
    fill: r.color,
  }));

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">调仓敏感性分析</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          对比不同调仓频率对同一投资组合长期表现的影响。选择多种调仓频率并行回测，
          直观查看 CAGR、波动率、最大回撤、夏普比率和 Sortino 比率的差异。
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">可分析内容</div>
            <div className="bt-seo-feature-desc">每日/每周/每月/每季度/每年调仓对组合收益与风险的影响，支持偏离带扫描。</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">输出结果</div>
            <div className="bt-seo-feature-desc">散点图、分布图、偏移曲线和对比表格，多维度展示调仓频率对组合表现的影响。</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">相关工具：</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>组合回测</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/lumpsum-vs-dca" className="link-blue" style={{ fontWeight: 700 }}>一次性vs定投</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
        </div>
      </div>

      <div className="bt-main-card card">
        {/* 参数区 */}
        <div className="params-section">
          <div className="params-title">参数设置</div>
          <div className="params-row">
            <div className="param-field">
              <label className="param-label">开始日期</label>
              <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="param-field">
              <label className="param-label">结束日期</label>
              <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="param-field param-field-start-val">
              <label className="param-label">初始资金</label>
              <div className="param-input-prefix-wrap">
                <span className="param-input-prefix">{baseCurrency === 'usd' ? '$' : '¥'}</span>
                <input type="number" className="param-input param-input-with-prefix" value={startingValue} onChange={(e) => setStartingValue(Number(e.target.value))} />
              </div>
            </div>
            <div className="param-field" style={{ width: 90 }}>
              <label className="param-label">货币</label>
              <select className="param-input" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value as 'usd' | 'cny')}>
                <option value="usd">USD ($)</option>
                <option value="cny">CNY (¥)</option>
              </select>
            </div>
            <label className="param-toggle">
              <span>通胀调整</span>
              <div className={`toggle-switch ${adjustForInflation ? 'active' : ''}`} onClick={() => setAdjustForInflation(!adjustForInflation)} />
            </label>
          </div>

          {/* 调仓频率多选 */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>调仓频率（多选）</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {REBALANCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-control)',
                    border: `1px solid ${selectedFreqs.includes(opt.value) ? opt.color : 'var(--border-soft)'}`,
                    backgroundColor: selectedFreqs.includes(opt.value) ? `${opt.color}18` : 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    color: selectedFreqs.includes(opt.value) ? opt.color : 'var(--text-muted)',
                    transition: 'all .12s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedFreqs.includes(opt.value)}
                    onChange={() => toggleFreq(opt.value)}
                    style={{ display: 'none' }}
                  />
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* 偏离扫描 */}
          <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="param-field" style={{ width: 120 }}>
              <label className="param-label">绝对偏离带</label>
              <div className="param-input-suffix-wrap">
                <input
                  type="number"
                  className="param-input param-input-with-suffix"
                  value={absoluteBand}
                  onChange={(e) => setAbsoluteBand(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="留空关闭"
                  min={0}
                  max={50}
                />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
            <div className="param-field" style={{ width: 120 }}>
              <label className="param-label">相对偏离带</label>
              <div className="param-input-suffix-wrap">
                <input
                  type="number"
                  className="param-input param-input-with-suffix"
                  value={relativeBand}
                  onChange={(e) => setRelativeBand(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="留空关闭"
                  min={0}
                  max={100}
                />
                <span className="param-input-suffix">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 组合编辑器 */}
        <div className="portfolios-section">
          <div className="portfolios-header">
            <span className="portfolios-title">投资组合</span>
          </div>
          <div className="portfolios-cards">
            <div className="portfolio-card">
              {assets.map((a, i) => (
                <div key={i} className="ticker-row">
                  <input
                    type="text"
                    value={a.ticker}
                    onChange={(e) => updateAsset(i, 'ticker', e.target.value)}
                    placeholder="输入代码，如 VTI"
                    className="ticker-input"
                  />
                  <div className="weight-cell">
                    <input
                      type="number"
                      value={a.weight || ''}
                      onChange={(e) => updateAsset(i, 'weight', Number(e.target.value))}
                      min={0}
                      max={100}
                      className="weight-input"
                      placeholder="%"
                    />
                    <span className="weight-suffix">%</span>
                  </div>
                  <button onClick={() => removeAsset(i)} className="row-remove-btn" title="删除">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="portfolio-card-toolbar">
                <button className="toolbar-btn" onClick={addAsset}>
                  <Plus className="w-4 h-4" />
                  添加标的
                </button>
              </div>
              <div className={`portfolio-total ${Math.abs(totalWeight - 100) <= 0.01 ? 'complete' : 'incomplete'}`}>
                <span>合计</span>
                <span className="total-value">{totalWeight}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 运行按钮 */}
        <div className="bt-action-row">
          <button onClick={runSensitivity} disabled={isLoading} className="main-action-btn" style={{ width: '100%' }}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isLoading ? '分析中...' : '开始分析'}
          </button>
        </div>
      </div>

      {/* 错误 */}
      {error && (
        <div className="bt-results-card card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}

      {/* 结果区域 - 4个Tab */}
      {results.length > 0 && (
        <div className="bt-results-card card">
          <div className="result-tabs" style={{ marginBottom: 16 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Scatter 散点图 */}
          {activeTab === 'scatter' && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
                风险-收益散点图
              </div>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis dataKey="volatility" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '波动率 (%)', position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis dataKey="cagr" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: 'CAGR (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
                  <ZAxis range={[120, 120]} />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const d = payload[0].payload;
                      return (
                        <div style={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', padding: 10, color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
                          <div>CAGR: {d.cagr?.toFixed(2)}%</div>
                          <div>波动率: {d.volatility?.toFixed(2)}%</div>
                          <div>最大回撤: {d.maxDrawdown?.toFixed(2)}%</div>
                          <div>夏普比率: {d.sharpe?.toFixed(2)}</div>
                          <div>Sortino: {d.sortino?.toFixed(2)}</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData}>
                    {scatterData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              {/* 图例 */}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                {results.map((r) => (
                  <div key={r.frequency} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                    <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Distributions 分布图 */}
          {activeTab === 'distributions' && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
                CAGR 分布
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={distributionData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
                  <Bar dataKey="CAGR" radius={[4, 4, 0, 0]} barSize={40}>
                    {distributionData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>
                最大回撤 分布
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={distributionData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
                  <Bar dataKey="最大回撤" radius={[4, 4, 0, 0]} barSize={40}>
                    {distributionData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12, marginTop: 24 }}>
                夏普比率 分布
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={distributionData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
                  <Bar dataKey="夏普比率" radius={[4, 4, 0, 0]} barSize={40}>
                    {distributionData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tab 3: Offset Curves 偏移曲线 */}
          {activeTab === 'offset' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>偏移曲线</div>
                <select
                  className="param-input"
                  style={{ width: 120, fontSize: 12 }}
                  value={offsetFreq}
                  onChange={(e) => {
                    setOffsetFreq(e.target.value as RebalanceFrequency);
                    runOffsetScan(e.target.value as RebalanceFrequency);
                  }}
                >
                  {REBALANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {isLoadingOffset && <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--brand)' }} />}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                选择一个调仓频率，查看不同偏移值（rebalance offset）对 CAGR 的影响
              </div>
              {offsetResults.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={offsetResults.map((r) => ({ offset: r.offset, cagr: Number((r.cagr * 100).toFixed(2)) }))} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                    <XAxis dataKey="offset" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} label={{ value: '偏移值（交易日）', position: 'insideBottom', offset: -5, fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}%`} label={{ value: 'CAGR (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)' }} />
                    <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 12, backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-soft)', borderRadius: 'var(--radius-control)', color: 'var(--text-body)', boxShadow: 'var(--shadow-md)' }} />
                    <Legend />
                    <Line type="monotone" dataKey="cagr" name="CAGR" stroke="var(--brand)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                  {isLoadingOffset ? '正在计算偏移曲线...' : '运行分析后自动生成偏移曲线'}
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Table 表格 */}
          {activeTab === 'table' && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
                调仓敏感性对比
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                      <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        调仓频率
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        CAGR
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        波动率
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        最大回撤
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        夏普比率
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        Sortino
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, idx) => {
                      const bestCagr = Math.max(...results.map((x) => x.cagr));
                      const bestStdev = Math.min(...results.map((x) => x.stdev));
                      const bestMdd = Math.min(...results.map((x) => x.maxDrawdown));
                      const bestSharpe = Math.max(...results.map((x) => x.sharpe));
                      const bestSortino = Math.max(...results.map((x) => x.sortino));

                      return (
                        <tr key={r.frequency} style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                          <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                              style={{ backgroundColor: r.color }}
                            />
                            {r.label}
                          </td>
                          <td
                            className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                            style={{
                              color: r.cagr === bestCagr ? 'var(--success)' : 'var(--text-strong)',
                              fontWeight: r.cagr === bestCagr ? 700 : 500,
                              borderBottom: '1px solid var(--border-soft)',
                            }}
                          >
                            {fmtPct(r.cagr)}
                          </td>
                          <td
                            className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                            style={{
                              color: r.stdev === bestStdev ? 'var(--success)' : 'var(--text-strong)',
                              fontWeight: r.stdev === bestStdev ? 700 : 500,
                              borderBottom: '1px solid var(--border-soft)',
                            }}
                          >
                            {fmtPct(r.stdev)}
                          </td>
                          <td
                            className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                            style={{
                              color: r.maxDrawdown === bestMdd ? 'var(--success)' : 'var(--text-strong)',
                              fontWeight: r.maxDrawdown === bestMdd ? 700 : 500,
                              borderBottom: '1px solid var(--border-soft)',
                            }}
                          >
                            {fmtPct(r.maxDrawdown)}
                          </td>
                          <td
                            className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                            style={{
                              color: r.sharpe === bestSharpe ? 'var(--success)' : 'var(--text-strong)',
                              fontWeight: r.sharpe === bestSharpe ? 700 : 500,
                              borderBottom: '1px solid var(--border-soft)',
                            }}
                          >
                            {fmtNum(r.sharpe)}
                          </td>
                          <td
                            className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                            style={{
                              color: r.sortino === bestSortino ? 'var(--success)' : 'var(--text-strong)',
                              fontWeight: r.sortino === bestSortino ? 700 : 500,
                              borderBottom: '1px solid var(--border-soft)',
                            }}
                          >
                            {fmtNum(r.sortino)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 增长曲线对比 */}
              {results.some((r) => r.growthCurve && r.growthCurve.length > 0) && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
                    增长曲线对比
                  </div>
                  <div style={{ position: 'relative', width: '100%', height: 350 }}>
                    <svg viewBox="0 0 800 350" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
                      {results.map((r) => {
                        if (!r.growthCurve || r.growthCurve.length < 2) return null;
                        const minVal = Math.min(...results.flatMap((x) => x.growthCurve?.map((p) => p.value) ?? []));
                        const maxVal = Math.max(...results.flatMap((x) => x.growthCurve?.map((p) => p.value) ?? []));
                        const range = maxVal - minVal || 1;
                        const points = r.growthCurve
                          .map((p, i) => {
                            const x = (i / (r.growthCurve!.length - 1)) * 780 + 10;
                            const y = 340 - ((p.value - minVal) / range) * 320 - 10;
                            return `${x},${y}`;
                          })
                          .join(' ');
                        return (
                          <polyline
                            key={r.frequency}
                            points={points}
                            fill="none"
                            stroke={r.color}
                            strokeWidth={2}
                          />
                        );
                      })}
                    </svg>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                      {results.map((r) => (
                        <div key={r.frequency} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                          <span
                            className="inline-block w-3 h-1 rounded"
                            style={{ backgroundColor: r.color }}
                          />
                          <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
