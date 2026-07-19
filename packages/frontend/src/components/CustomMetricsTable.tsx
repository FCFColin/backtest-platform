/**
 * @file 自定义指标表格
 * @description 展示各投资组合的自选统计指标对比表格。
 *   行渲染与表头复用 statistics-table/ 子目录的共享组件，消除与 StatisticsTable 的重复逻辑。
 */
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult, Statistics } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { StatisticsTableHeader } from './statistics-table/StatisticsTableHeader.js';
import { MetricsRows } from './statistics-table/MetricsRows.js';
import type { StatRow } from './statistics-table/types.js';

/** 自定义指标表格 Props */
interface CustomMetricsTableProps {
  portfolios: PortfolioResult[];
}

/** 可选指标全集（fmt 仅用 pct/ratio，兼容 StatRow 的 FmtType 联合） */
const ALL_METRICS: StatRow[] = [
  { label: 'components.customMetricsTable.metrics.cagr', key: 'cagr', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.mwrr', key: 'mwrr', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.totalReturn', key: 'totalReturn', fmt: 'pct' },
  { label: 'backtest.stdev', key: 'stdev', fmt: 'pct' },
  { label: 'backtest.sharpeRatio', key: 'sharpe', fmt: 'ratio' },
  { label: 'backtest.sortino', key: 'sortino', fmt: 'ratio' },
  { label: 'components.customMetricsTable.metrics.calmar', key: 'calmar', fmt: 'ratio' },
  { label: 'backtest.maxDrawdown', key: 'maxDrawdown', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.ulcerIndex', key: 'ulcerIndex', fmt: 'ratio' },
  { label: 'components.customMetricsTable.metrics.beta', key: 'beta', fmt: 'ratio' },
  { label: 'components.customMetricsTable.metrics.alpha', key: 'alpha', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.rSquared', key: 'rSquared', fmt: 'ratio' },
  {
    label: 'components.customMetricsTable.metrics.trackingError',
    key: 'trackingError',
    fmt: 'pct',
  },
  {
    label: 'components.customMetricsTable.metrics.informationRatio',
    key: 'informationRatio',
    fmt: 'ratio',
  },
  {
    label: 'components.customMetricsTable.metrics.upsideCapture',
    key: 'upsideCapture',
    fmt: 'pct',
  },
  {
    label: 'components.customMetricsTable.metrics.downsideCapture',
    key: 'downsideCapture',
    fmt: 'pct',
  },
  { label: 'components.customMetricsTable.metrics.skewness', key: 'skewness', fmt: 'ratio' },
  {
    label: 'components.customMetricsTable.metrics.excessKurtosis',
    key: 'excessKurtosis',
    fmt: 'ratio',
  },
  { label: 'components.customMetricsTable.metrics.var5', key: 'var5', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.cvar5', key: 'cvar5', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.swr10y', key: 'swr10y', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.pwr10y', key: 'pwr10y', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.swr30y', key: 'swr30y', fmt: 'pct' },
  { label: 'components.customMetricsTable.metrics.pwr30y', key: 'pwr30y', fmt: 'pct' },
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

/** 指标选择下拉项 */
function MetricDropdownItems({
  selectedKeys,
  onToggle,
}: {
  selectedKeys: Set<keyof Statistics>;
  onToggle: (key: keyof Statistics) => void;
}) {
  const { t } = useTranslation();
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
            {t(m.label)}
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
  const { t } = useTranslation();
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
        {t('components.customMetricsTable.selectMetrics', {
          selected: selectedKeys.size,
          total: ALL_METRICS.length,
        })}
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

export default function CustomMetricsTable({ portfolios }: CustomMetricsTableProps) {
  const { t } = useTranslation();
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
      <ChartCard title={t('tabs.myMetrics')}>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('components.customMetricsTable.noData')}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={t('tabs.myMetrics')}
      headerExtra={<MetricSelector selectedKeys={selectedKeys} onToggle={toggleKey} />}
    >
      {visibleMetrics.length === 0 ? (
        <div
          className="text-[13px]"
          style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}
        >
          {t('components.customMetricsTable.selectAtLeastOne')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <StatisticsTableHeader portfolios={portfolios} minWidth="160px" />
            </thead>
            <tbody>
              <MetricsRows rows={visibleMetrics} portfolios={portfolios} />
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
