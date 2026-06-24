/**
 * @file 主成分分析（PCA）页面
 * @description 对多个资产的收益率序列进行主成分分析，展示特征值、累计方差解释率、载荷矩阵与主成分得分
 * @route /pca
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play, Plus, X } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, ZAxis,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { PCAResult } from '../../shared/types';
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

/**
 * 载荷矩阵热力图配色（发散色阶，0 为中性）
 * 取值范围约 [-1, 1]，正值偏绿、负值偏红
 */
function getLoadingColor(val: number): string {
  if (val >= 0.8) return '#1a7a3a';
  if (val >= 0.6) return '#2e8b57';
  if (val >= 0.4) return '#6abf7e';
  if (val >= 0.2) return '#b8e0c4';
  if (val > -0.2) return 'var(--bg-subtle)';
  if (val > -0.4) return '#f0c8c8';
  if (val > -0.6) return '#d47070';
  if (val > -0.8) return '#b04040';
  return '#8b2020';
}

// ===== 主页面 =====
export default function PCAPage() {
  const [tickers, setTickers] = useState<string[]>(['SPY', 'TLT', 'GLD', 'QQQ']);
  const [startDate, setStartDate] = useState('2010-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [numComponents, setNumComponents] = useState<number | ''>('');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<PCAResult | null>(null);

  const addTicker = () => setTickers([...tickers, '']);
  const removeTicker = (idx: number) => {
    if (tickers.length > 1) setTickers(tickers.filter((_, i) => i !== idx));
  };
  const updateTicker = (idx: number, val: string) => {
    const next = [...tickers];
    next[idx] = val;
    setTickers(next);
  };

  const runAnalysis = () => {
    const validTickers = tickers.map((t) => t.trim()).filter(Boolean);
    if (validTickers.length < 2) {
      setError('PCA 分析至少需要 2 个标的代码');
      return;
    }
    run(async () => {
      const res = await fetch('/api/pca/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers: validTickers,
          startDate,
          endDate,
          numComponents: numComponents === '' ? undefined : numComponents,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || 'PCA 分析失败');
      setResults(json.data);
    });
  };

  // ===== 图表数据 =====

  // 特征值柱状图数据
  const eigenvalueData = useMemo(() => {
    if (!results) return [];
    return results.eigenvalues.map((val, idx) => ({
      component: `PC${idx + 1}`,
      eigenvalue: +val.toFixed(4),
    }));
  }, [results]);

  // 累计方差解释率折线图数据
  const cumulativeData = useMemo(() => {
    if (!results) return [];
    return results.cumulativeVariance.map((val, idx) => ({
      component: `PC${idx + 1}`,
      cumulative: +(val * 100).toFixed(2),
    }));
  }, [results]);

  // PC1 vs PC2 散点图数据
  const scatterData = useMemo(() => {
    if (!results || results.scores.length === 0) return [];
    return results.scores.map((row) => ({
      pc1: +row[0].toFixed(4),
      pc2: row[1] !== undefined ? +row[1].toFixed(4) : 0,
    }));
  }, [results]);

  // ===== 左侧参数面板 =====
  const paramsPanel = (
    <ParamsPanel>
      <ParamsSection title="资产选择" info="添加 2 个或以上标的代码，PCA 将基于它们的日收益率进行分析">
        <div className="portfolios-cards">
          <div className="portfolio-card">
            {tickers.map((t, idx) => (
              <div key={idx} className="ticker-row">
                <input
                  type="text"
                  value={t}
                  onChange={(e) => updateTicker(idx, e.target.value)}
                  placeholder="输入代码，如 SPY"
                  className="ticker-input"
                />
                {tickers.length > 1 && (
                  <button
                    onClick={() => removeTicker(idx)}
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
        <button className="portfolios-add-btn" onClick={addTicker} style={{ marginTop: 8 }}>
          <Plus className="w-4 h-4" />
          添加标的
        </button>
      </ParamsSection>

      <ParamsSection title="时间范围">
        <div className="params-row">
          <div className="param-field">
            <span className="param-label">开始日期</span>
            <input type="date" className="param-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="param-field">
            <span className="param-label">结束日期</span>
            <input type="date" className="param-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </ParamsSection>

      <ParamsSection title="分析参数" defaultOpen={false}>
        <div className="param-field">
          <span className="param-label">主成分数量</span>
          <div className="param-input-suffix-wrap">
            <input
              type="number"
              min={1}
              className="param-input param-input-with-suffix"
              value={numComponents}
              onChange={(e) => setNumComponents(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="自动"
            />
            <span className="param-input-suffix">个</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          留空则自动保留全部主成分（等于资产数量）
        </div>
      </ParamsSection>

      <div className="bt-action-row">
        <LoadingButton isLoading={isLoading} onClick={runAnalysis} loadingText="分析中...">
          <Play className="w-4 h-4" />
          开始分析
        </LoadingButton>
      </div>
    </ParamsPanel>
  );

  // ===== 右侧结果面板 =====
  const resultsPanel = (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          分析失败：{error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          {/* 特征值柱状图 */}
          <div className="chart-card">
            <div className="chart-card-title">特征值</div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={eigenvalueData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis dataKey="component" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => v.toFixed(2)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value.toFixed(4), '特征值']} />
                <Bar dataKey="eigenvalue" fill={CHART_COLORS[0]} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 累计方差解释率 */}
          <div className="chart-card">
            <div className="chart-card-title">累计方差解释率</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cumulativeData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis dataKey="component" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value.toFixed(2)}%`, '累计方差']} />
                <ReferenceLine y={90} stroke="var(--text-muted)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="cumulative" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 载荷矩阵热力图 */}
          <div className="chart-card">
            <div className="chart-card-title">载荷矩阵</div>
            <div className="overflow-x-auto">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }} />
                    {results.eigenvalues.map((_, j) => (
                      <th key={j} className="px-3 py-2 text-[11px] font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                        PC{j + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.tickers.map((ticker, i) => (
                    <tr key={ticker}>
                      <td className="px-3 py-2 text-[12px] font-medium" style={{ color: 'var(--text-body)' }}>{ticker}</td>
                      {results.eigenvalues.map((_, j) => {
                        const val = results.loadings[i]?.[j] ?? 0;
                        return (
                          <td key={j} className="text-[12px] text-center cursor-default"
                            style={{
                              backgroundColor: getLoadingColor(val),
                              color: Math.abs(val) > 0.5 ? '#fff' : 'var(--text-body)',
                              width: `${Math.max(56, 600 / results.eigenvalues.length)}px`,
                              height: `${Math.max(36, 400 / results.tickers.length)}px`,
                            }}
                            title={`${ticker} · PC${j + 1}: ${val.toFixed(3)}`}
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
          </div>

          {/* 主成分得分散点图 PC1 vs PC2 */}
          {results.scores.length > 0 && results.scores[0].length >= 2 && (
            <div className="chart-card">
              <div className="chart-card-title">主成分得分散点图（PC1 vs PC2）</div>
              <ResponsiveContainer width="100%" height={450}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis type="number" dataKey="pc1" name="PC1" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    label={{ value: 'PC1', position: 'insideBottom', offset: -10, style: { fill: 'var(--text-muted)', fontSize: 12 } }} />
                  <YAxis type="number" dataKey="pc2" name="PC2" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    label={{ value: 'PC2', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }} />
                  <ZAxis range={[20, 20]} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [value.toFixed(4), name]}
                    labelFormatter={() => ''} />
                  <Scatter data={scatterData} fill={CHART_COLORS[2]} fillOpacity={0.5} />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
                  <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {!results && !error && !isLoading && (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}>
          设置参数后点击「开始分析」查看结果
        </div>
      )}
    </div>
  );

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">主成分分析（PCA）</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          主成分分析（PCA）工具对多个资产的日收益率进行降维分析，提取主要驱动因子，帮助您理解资产组合的风险结构与共同变动来源。
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">可分析内容</div>
            <div className="bt-seo-feature-desc">特征值、累计方差解释率、载荷矩阵（各资产对主成分的贡献）、主成分得分。</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">适用场景</div>
            <div className="bt-seo-feature-desc">识别资产组合的主要风险因子、降维可视化、构建因子模型与组合分散化分析。</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">相关工具：</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>组合回测</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>资产分析</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>组合优化</Link>
        </div>
      </div>

      <ToolPageLayout title="PCA 参数" params={paramsPanel} results={resultsPanel} />
    </div>
  );
}
