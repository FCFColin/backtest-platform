import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult, Statistics } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import { StatisticsTableHeader, MetricsRows } from './statistics-table/index.js';
import type { StatRow } from './statistics-table/types.js';
interface CustomMetricsTableProps {
  portfolios: PortfolioResult[];
}
const ALL_METRICS: StatRow[] = [
  { label: 'stats.cagr', key: 'cagr', fmt: 'pct' },
  { label: 'stats.mwrr', key: 'mwrr', fmt: 'pct' },
  { label: 'stats.totalReturn', key: 'totalReturn', fmt: 'pct' },
  { label: 'stats.stdev', key: 'stdev', fmt: 'pct' },
  { label: 'stats.sharpe', key: 'sharpe', fmt: 'num' },
  { label: 'stats.sortino', key: 'sortino', fmt: 'num' },
  { label: 'stats.calmar', key: 'calmar', fmt: 'num' },
  { label: 'stats.maxDrawdown', key: 'maxDrawdown', fmt: 'pct' },
  { label: 'stats.ulcerIndex', key: 'ulcerIndex', fmt: 'num' },
  { label: 'stats.beta', key: 'beta', fmt: 'num' },
  { label: 'stats.alpha', key: 'alpha', fmt: 'num' },
  { label: 'stats.rSquared', key: 'rSquared', fmt: 'num' },
  { label: 'stats.trackingError', key: 'trackingError', fmt: 'pct' },
  { label: 'stats.informationRatio', key: 'informationRatio', fmt: 'num' },
  { label: 'stats.upsideCapture', key: 'upsideCapture', fmt: 'pct' },
  { label: 'stats.downsideCapture', key: 'downsideCapture', fmt: 'pct' },
  { label: 'stats.skewnessDaily', key: 'skewnessDaily' as keyof Statistics, fmt: 'num' },
  {
    label: 'stats.excessKurtosisDaily',
    key: 'excessKurtosisDaily' as keyof Statistics,
    fmt: 'num',
  },
  { label: 'stats.varDaily5', key: 'varDaily5' as keyof Statistics, fmt: 'pct' },
  { label: 'stats.cvarDaily5', key: 'cvarDaily5' as keyof Statistics, fmt: 'pct' },
  { label: 'stats.swr10y', key: 'swr10y', fmt: 'pct' },
  { label: 'stats.pwr10y', key: 'pwr10y', fmt: 'pct' },
  { label: 'stats.swr30y', key: 'swr30y', fmt: 'pct' },
  { label: 'stats.pwr30y', key: 'pwr30y', fmt: 'pct' },
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
        {t('Select Metrics ({{selected}}/{{total}})', {
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
      <ChartCard title={t('My Metrics')}>
        <div className="text-label" style={{ color: 'var(--text-muted)' }}>
          {t('No data')}
        </div>
      </ChartCard>
    );
  }
  return (
    <ChartCard
      title={t('My Metrics')}
      headerExtra={<MetricSelector selectedKeys={selectedKeys} onToggle={toggleKey} />}
    >
      {visibleMetrics.length === 0 ? (
        <div
          className="text-label"
          style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}
        >
          {t('Please select at least one metric')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="stat-table w-full">
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
