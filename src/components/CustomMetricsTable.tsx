/**
 * @file 自定义指标表格
 * @description 展示各投资组合的自选统计指标对比表格
 */
import { useState, useRef, useEffect } from 'react';
import type { PortfolioResult, Statistics } from '../../shared/types';
import { CHART_COLORS } from '../../shared/types';

/** 自定义指标表格 Props */
interface CustomMetricsTableProps {
  portfolios: PortfolioResult[];
}

const ALL_METRICS: { label: string; key: keyof Statistics; fmt: 'pct' | 'ratio' }[] = [
  { label: '年化收益', key: 'cagr', fmt: 'pct' },
  { label: '资金加权收益*', key: 'mwrr', fmt: 'pct' },
  { label: '总收益', key: 'totalReturn', fmt: 'pct' },
  { label: '年化波动率', key: 'stdev', fmt: 'pct' },
  { label: '夏普比率', key: 'sharpe', fmt: 'ratio' },
  { label: '索提诺比率', key: 'sortino', fmt: 'ratio' },
  { label: '卡玛比率', key: 'calmar', fmt: 'ratio' },
  { label: '最大回撤', key: 'maxDrawdown', fmt: 'pct' },
  { label: '溃疡指数', key: 'ulcerIndex', fmt: 'ratio' },
  { label: '贝塔', key: 'beta', fmt: 'ratio' },
  { label: '阿尔法', key: 'alpha', fmt: 'pct' },
  { label: 'R平方', key: 'rSquared', fmt: 'ratio' },
  { label: '跟踪误差', key: 'trackingError', fmt: 'pct' },
  { label: '信息比率', key: 'informationRatio', fmt: 'ratio' },
  { label: '上行捕获', key: 'upsideCapture', fmt: 'pct' },
  { label: '下行捕获', key: 'downsideCapture', fmt: 'pct' },
  { label: '偏度', key: 'skewness', fmt: 'ratio' },
  { label: '超额峰度', key: 'excessKurtosis', fmt: 'ratio' },
  { label: 'VaR(5%)', key: 'var5', fmt: 'pct' },
  { label: 'CVaR(5%)', key: 'cvar5', fmt: 'pct' },
  { label: 'SWR(10年)', key: 'swr10y', fmt: 'pct' },
  { label: 'PWR(10年)', key: 'pwr10y', fmt: 'pct' },
  { label: 'SWR(30年)', key: 'swr30y', fmt: 'pct' },
  { label: 'PWR(30年)', key: 'pwr30y', fmt: 'pct' },
];

const DEFAULT_KEYS: (keyof Statistics)[] = [
  'cagr',
  'stdev',
  'sharpe',
  'sortino',
  'maxDrawdown',
  'calmar',
  'beta',
  'alpha',
  'swr10y',
  'pwr30y',
];

function formatValue(v: number | undefined, fmt: 'pct' | 'ratio'): string {
  if (v == null) return '\u2014';
  if (fmt === 'pct') return `${(v * 100).toFixed(2)}%`;
  return v.toFixed(2);
}

/** 指标选择下拉项 */
function MetricDropdownItems({
  selectedKeys,
  onToggle,
}: {
  selectedKeys: Set<keyof Statistics>;
  onToggle: (key: keyof Statistics) => void;
}) {
  return (
    <>
      {ALL_METRICS.map((m) => {
        const checked = selectedKeys.has(m.key);
        return (
          <label
            key={m.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text-body)',
              backgroundColor: checked ? 'var(--bg-subtle)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-subtle)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = checked
                ? 'var(--bg-subtle)'
                : 'transparent';
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(m.key)}
              style={{ accentColor: 'var(--accent)' }}
            />
            {m.label}
          </label>
        );
      })}
    </>
  );
}

/** 指标选择下拉 */
function MetricSelector({
  selectedKeys,
  onToggle,
}: {
  selectedKeys: Set<keyof Statistics>;
  onToggle: (key: keyof Statistics) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: '4px 12px',
          fontSize: '12px',
          backgroundColor: 'var(--bg-subtle)',
          color: 'var(--text-body)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-control)',
          cursor: 'pointer',
        }}
      >
        选择指标 ({selectedKeys.size}/{ALL_METRICS.length})
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: '4px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-control)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 50,
            maxHeight: '320px',
            overflowY: 'auto',
            minWidth: '200px',
            padding: '4px 0',
          }}
        >
          <MetricDropdownItems selectedKeys={selectedKeys} onToggle={onToggle} />
        </div>
      )}
    </div>
  );
}

/** 指标表头列 */
function MetricsTableHeader({ portfolios }: { portfolios: PortfolioResult[] }) {
  return (
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <th
        className="text-[12px] font-semibold text-left py-2.5 px-3"
        style={{
          color: 'var(--text-muted)',
          borderBottom: '2px solid var(--border-soft)',
          minWidth: '160px',
        }}
      >
        指标
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="text-[12px] font-semibold text-right py-2.5 px-3"
          style={{
            color: 'var(--text-muted)',
            borderBottom: '2px solid var(--border-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </th>
      ))}
    </tr>
  );
}

/** 指标对比表格 */
function MetricsTable({
  portfolios,
  visibleMetrics,
}: {
  portfolios: PortfolioResult[];
  visibleMetrics: typeof ALL_METRICS;
}) {
  if (visibleMetrics.length === 0) {
    return (
      <div
        className="text-[13px]"
        style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}
      >
        请选择至少一个指标
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <MetricsTableHeader portfolios={portfolios} />
        </thead>
        <tbody>
          {visibleMetrics.map((m, rowIdx) => {
            const hasAnyValue = portfolios.some(
              (p) => p.statistics[m.key] !== undefined && p.statistics[m.key] !== null,
            );
            if (!hasAnyValue) return null;
            return (
              <tr
                key={m.key}
                style={{ backgroundColor: rowIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[13px] py-2 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {m.label}
                </td>
                {portfolios.map((p) => (
                  <td
                    key={p.name}
                    className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                    style={{
                      color: 'var(--text-strong)',
                      borderBottom: '1px solid var(--border-soft)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatValue(p.statistics[m.key] as number | undefined, m.fmt)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CustomMetricsTable({ portfolios }: CustomMetricsTableProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<keyof Statistics>>(
    () => new Set(DEFAULT_KEYS),
  );

  const toggleKey = (key: keyof Statistics) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleMetrics = ALL_METRICS.filter((m) => selectedKeys.has(m.key));

  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">自定义指标</div>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          暂无统计数据
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div className="chart-card-title" style={{ marginBottom: 0 }}>
          自定义指标
        </div>
        <MetricSelector selectedKeys={selectedKeys} onToggle={toggleKey} />
      </div>
      <MetricsTable portfolios={portfolios} visibleMetrics={visibleMetrics} />
    </div>
  );
}
