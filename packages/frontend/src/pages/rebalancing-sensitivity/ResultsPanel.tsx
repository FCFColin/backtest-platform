import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import {
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { RebalanceFrequency } from '@backtest/shared';
import {
  REBALANCE_OPTIONS,
  TABS,
  type FreqResult,
  type RebalancingState,
} from './rebalancingSensitivityUtils.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  DATE_TICK_FORMATTER,
  CHART_TOOLTIP_STYLE,
} from '@/lib/chart-theme.js';
import {
  Card,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { fmtPct } from '@/utils/format';
import { XYScatterChart } from '@/components/charts/sharedChartContent.js';
function ScatterTab({ results }: { results: FreqResult[] }) {
  const { t } = useTranslation();
  const data = results.map((r) => ({
    volatility: r.stdev * 100,
    cagr: r.cagr * 100,
    label: r.label,
    color: r.color,
    sharpe: r.sharpe,
    maxDrawdown: r.maxDrawdown * 100,
    sortino: r.sortino,
  }));
  return (
    <XYScatterChart
      xKey="volatility"
      yKey="cagr"
      xName={t('Volatility')}
      yName="CAGR"
      height={400}
      margin={{ top: 20, right: 30, bottom: 30, left: 10 }}
      zDataKey="sharpe"
      zRange={[60, 200]}
      xTickFormatter={(v: number) => `${v.toFixed(1)}%`}
      yTickFormatter={(v: number) => `${v.toFixed(1)}%`}
      tooltipFormatter={(v: number, name: string) =>
        name === 'sharpe' || name === 'sortino' ? v.toFixed(2) : `${v.toFixed(2)}%`
      }
    >
      {data.map((p) => (
        <Scatter key={p.label} data={[p]} fill={p.color} />
      ))}
    </XYScatterChart>
  );
}
function DistributionTab({ results }: { results: FreqResult[] }) {
  const { t } = useTranslation();
  const data = results.map((r) => ({
    name: t(`rebalancingSensitivity.freq.${r.frequency}`),
    CAGR: Number((r.cagr * 100).toFixed(2)),
    maxDrawdown: Number((r.maxDrawdown * 100).toFixed(2)),
    sharpeRatio: Number(r.sharpe.toFixed(2)),
    fill: r.color,
  }));
  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="name" tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
        <Legend wrapperStyle={{ fontSize: '12px' }} />
        <Bar dataKey="CAGR" radius={[2, 2, 0, 0]}>
          {data.map((e, i) => (
            <Cell key={i} fill={e.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
function OffsetSelector({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-body text-fg-tertiary">{t('Frequency')}:</span>
      <Select
        value={s.offsetFreq}
        onValueChange={(v) => {
          const freq = v as RebalanceFrequency;
          s.setOffsetFreq(freq);
          void s.runOffsetScan(freq);
        }}
      >
        <SelectTrigger className="h-9 w-32" aria-label={t('Frequency')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          {REBALANCE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {t(`rebalancingSensitivity.freq.${o.value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {s.isLoadingOffset && <Loader2 className="size-4 animate-spin text-fg-tertiary" />}
    </div>
  );
}
function OffsetBarChart({ offsetData }: { offsetData: Array<{ offset: string; cagr: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={offsetData} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="offset" tick={AXIS_TICK_STYLE} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
        <Bar dataKey="cagr" fill={CHART_COLORS[2]} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
function OffsetGrowthChart({ data }: { data: Array<{ date: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toLocaleString()} />
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS[0]}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
function OffsetTab({ s }: { s: RebalancingState }) {
  const offsetData = s.offsetResults.map((r) => ({
    offset: `+${r.offset}d`,
    cagr: Number((r.cagr * 100).toFixed(2)),
  }));
  const growthData = s.results.find((r) => r.frequency === s.offsetFreq)?.growthCurve ?? [];
  return (
    <>
      <OffsetSelector s={s} />
      <OffsetBarChart offsetData={offsetData} />
      {growthData.length > 0 && <OffsetGrowthChart data={growthData} />}
    </>
  );
}
const resultsTableCols = (t: TFunction) => [
  [t('stats.cagr'), 'cagr'] as const,
  [t('Volatility'), 'stdev'] as const,
  [t('Max Drawdown'), 'mdd'] as const,
  [t('Sharpe'), 'sharpe'] as const,
  ['Sortino', 'sortino'] as const,
];
function ResultsTableHead() {
  const { t } = useTranslation();
  const cols = resultsTableCols(t);
  return (
    <thead>
      <tr className="bg-input-bg">
        <th className="border-b-2 border-subtle px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
          {t('Frequency')}
        </th>
        {cols.map(([label]) => (
          <th
            key={label}
            className="border-b-2 border-subtle px-3 py-2.5 text-right text-caption font-semibold text-fg-tertiary"
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
function cellClassName(isBest: boolean): string {
  return `border-b border-subtle px-3 py-2 text-right font-mono text-label font-medium ${isBest ? 'font-bold text-success' : 'text-fg'}`;
}
function ResultsTable({ results }: { results: FreqResult[] }) {
  const best = {
    cagr: Math.max(...results.map((x) => x.cagr)),
    stdev: Math.min(...results.map((x) => x.stdev)),
    mdd: Math.min(...results.map((x) => x.maxDrawdown)),
    sharpe: Math.max(...results.map((x) => x.sharpe)),
    sortino: Math.max(...results.map((x) => x.sortino)),
  };
  type NumKey = 'cagr' | 'stdev' | 'maxDrawdown' | 'sharpe' | 'sortino';
  const cells: Array<{ k: NumKey; bk: keyof typeof best; f: (v: number) => string }> = [
    { k: 'cagr', bk: 'cagr', f: fmtPct },
    { k: 'stdev', bk: 'stdev', f: fmtPct },
    { k: 'maxDrawdown', bk: 'mdd', f: fmtPct },
    { k: 'sharpe', bk: 'sharpe', f: (v) => v.toFixed(2) },
    { k: 'sortino', bk: 'sortino', f: (v) => v.toFixed(2) },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <ResultsTableHead />
        <tbody>
          {results.map((r, idx) => (
            <tr key={r.frequency} className={idx % 2 === 1 ? 'bg-input-bg' : ''}>
              <td className="border-b border-subtle px-3 py-2 text-label text-fg">
                <span
                  className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
                  style={{ backgroundColor: r.color }}
                />
                {r.label}
              </td>
              {cells.map((c) => {
                const val = r[c.k] as number;
                return (
                  <td key={c.k} className={cellClassName(val === best[c.bk])}>
                    {c.f(val)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ResultsPanel({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={s.error}
      errorPrefix={`${t('Analysis failed')}：`}
      isLoading={s.isLoading}
      hasResults={s.results.length > 0}
      loadingLabel={t('Analyzing...')}
      emptyTitle={t('Select rebalancing frequencies and click "Run Analysis"')}
    >
      <Card className="p-5">
        <div className="mb-4 flex gap-2 border-b-2 border-subtle pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => s.setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors ${s.activeTab === tab.key ? 'bg-brand/10 text-brand' : 'text-fg-tertiary hover:text-fg-secondary'}`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        {s.activeTab === 'scatter' && <ScatterTab results={s.results} />}
        {s.activeTab === 'distributions' && <DistributionTab results={s.results} />}
        {s.activeTab === 'offset' && <OffsetTab s={s} />}
        {s.activeTab === 'table' && <ResultsTable results={s.results} />}
      </Card>
    </ResultsShell>
  );
}
