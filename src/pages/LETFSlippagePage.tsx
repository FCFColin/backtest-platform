/**
 * @file LETF Slippage（杠杆 ETF 滑点）页面
 * @description 分析杠杆 ETF 相对基准指数的滑点拖累，展示滑点曲线、年化拖累、实际杠杆 vs 名义杠杆及对比统计
 * @route /letf-slippage
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '../../shared/types';
import type { LETFResult } from '../../shared/types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import LoadingButton from '../components/LoadingButton';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { ParamsPanel, ParamsSection } from '../components/ParamsPanel';
import { SortableTable, type Column } from '../components/SortableTable';

// ===== 工具函数 =====

const tooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-md)',
};

function fmtPct(v: number | undefined | null): string {
  if (v === undefined || v === null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

// ===== 对比统计行类型 =====
interface StatRow {
  metric: string;
  value: number;
}

// ===== 主页面 =====
export default function LETFSlippagePage() {
  const [letfTicker, setLetfTicker] = useState('TQQQ');
  const [benchmarkTicker, setBenchmarkTicker] = useState('QQQ');
  const [leverage, setLeverage] = useState(3);
  const [startDate, setStartDate] = useState('2015-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const { isLoading, error, run, setError } = useAsyncAction();
  const [results, setResults] = useState<LETFResult | null>(null);

  const runAnalysis = () => {
    if (!letfTicker.trim() || !benchmarkTicker.trim()) {
      setError('请输入杠杆 ETF 和基准指数代码');
      return;
    }
    run(async () => {
      const res = await fetch('/api/letf/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letfTicker: letfTicker.trim(),
          benchmarkTicker: benchmarkTicker.trim(),
          leverage,
          startDate,
          endDate,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || 'LETF 滑点分析失败');
      setResults(json.data);
    });
  };

  // ===== 图表数据 =====

  // 滑点曲线数据（累积 + 每日，每日由累积差分推导）
  const slippageChartData = useMemo(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const daily =
        i === 0 ? p.slippage : p.slippage - results.slippageCurve[i - 1].slippage;
      return {
        date: p.date,
        cumulative: +(p.slippage * 100).toFixed(4),
        daily: +(daily * 100).toFixed(4),
      };
    });
  }, [results]);

  // 实际杠杆 vs 名义杠杆数据
  const leverageChartData = useMemo(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const lev = results.effectiveLeverage[i];
      return {
        date: p.date,
        effective: lev == null || isNaN(lev) ? null : +lev.toFixed(3),
        nominal: leverage,
      };
    });
  }, [results, leverage]);

  // 对比统计表数据
  const statRows = useMemo<StatRow[]>(() => {
    if (!results) return [];
    return [
      { metric: '基准收益', value: results.stats.benchmarkReturn },
      { metric: 'LETF 收益', value: results.stats.letfReturn },
      { metric: '预期收益', value: results.stats.expectedReturn },
      { metric: '滑点', value: results.stats.slippage },
      { metric: '年化拖累', value: results.annualDecay },
    ];
  }, [results]);

  const statColumns: Column<StatRow>[] = [
    { key: 'metric', label: '指标' },
    {
      key: 'value',
      label: '数值',
      sortValue: (r) => r.value,
      render: (r) => (
        <span className="font-mono" style={{ fontWeight: 600 }}>
          {fmtPct(r.value)}
        </span>
      ),
    },
  ];

  // ===== 左侧参数面板 =====
  const paramsPanel = (
    <ParamsPanel>
      <ParamsSection
        title="ETF 选择"
        info="杠杆 ETF（如 TQQQ/UPRO）与对应基准指数（如 QQQ/SPY），杠杆倍数需与 ETF 实际杠杆一致"
      >
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">杠杆 ETF</span>
          <input
            type="text"
            className="param-input"
            value={letfTicker}
            onChange={(e) => setLetfTicker(e.target.value)}
            placeholder="如 TQQQ"
          />
        </div>
        <div className="param-field" style={{ marginBottom: 8 }}>
          <span className="param-label">基准指数</span>
          <input
            type="text"
            className="param-input"
            value={benchmarkTicker}
            onChange={(e) => setBenchmarkTicker(e.target.value)}
            placeholder="如 QQQ"
          />
        </div>
        <div className="param-field">
          <span className="param-label">杠杆倍数</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[2, 3].map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className="param-input"
                style={{
                  flex: 1,
                  cursor: 'pointer',
                  fontWeight: 600,
                  textAlign: 'center',
                  ...(leverage === lev
                    ? {
                        borderColor: 'var(--brand)',
                        backgroundColor: 'var(--brand)',
                        color: '#fff',
                      }
                    : {}),
                }}
              >
                {lev}x
              </button>
            ))}
          </div>
        </div>
      </ParamsSection>

      <ParamsSection title="时间范围">
        <div className="params-row">
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
          {/* 关键指标卡片 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                年化拖累
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: results.annualDecay < 0 ? 'var(--error)' : 'var(--text-strong)',
                }}
              >
                {fmtPct(results.annualDecay)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                基准收益
              </div>
              <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}>
                {fmtPct(results.stats.benchmarkReturn)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                LETF 收益
              </div>
              <div className="font-mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)' }}>
                {fmtPct(results.stats.letfReturn)}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                总滑点
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: results.stats.slippage < 0 ? 'var(--error)' : 'var(--text-strong)',
                }}
              >
                {fmtPct(results.stats.slippage)}
              </div>
            </div>
          </div>

          {/* 滑点曲线图 */}
          <div className="chart-card">
            <div className="chart-card-title">滑点曲线</div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={slippageChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(0, 7)}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label: string) => `日期: ${label}`}
                  formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  name="累积滑点"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="daily"
                  name="每日滑点"
                  stroke={CHART_COLORS[1]}
                  strokeWidth={1}
                  dot={false}
                  activeDot={{ r: 3 }}
                  strokeOpacity={0.6}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 实际杠杆 vs 名义杠杆 */}
          <div className="chart-card">
            <div className="chart-card-title">实际杠杆 vs 名义杠杆</div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={leverageChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(0, 7)}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(1)}x`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label: string) => `日期: ${label}`}
                  formatter={(value: number) => [`${value.toFixed(2)}x`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
                <Line
                  type="monotone"
                  dataKey="nominal"
                  name={`名义杠杆 (${leverage}x)`}
                  stroke="var(--text-muted)"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="effective"
                  name="实际杠杆"
                  stroke={CHART_COLORS[2]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 对比统计表 */}
          <div className="chart-card">
            <div className="chart-card-title">对比统计</div>
            <SortableTable
              columns={statColumns}
              data={statRows}
              initialSortKey="value"
              initialSortDir="desc"
            />
          </div>
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
        <h1 className="bt-page-title">LETF 滑点分析</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          杠杆 ETF（LETF）滑点分析工具，量化杠杆 ETF 相对基准指数的预期收益与实际收益之间的偏差，揭示长期持有杠杆 ETF 的衰减拖累。
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">可分析内容</div>
            <div className="bt-seo-feature-desc">
              每日/累积滑点曲线、年化拖累、实际杠杆 vs 名义杠杆、基准与 LETF 收益对比。
            </div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">适用场景</div>
            <div className="bt-seo-feature-desc">
              评估杠杆 ETF 长期持有的衰减成本、验证杠杆复利偏差、对比不同 LETF 的跟踪效率。
            </div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">相关工具：</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
            组合回测
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
            资产分析
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/pca" className="link-blue" style={{ fontWeight: 700 }}>
            主成分分析
          </Link>
        </div>
      </div>

      <ToolPageLayout title="LETF 参数" params={paramsPanel} results={resultsPanel} />
    </div>
  );
}
