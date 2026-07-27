/**
 * @file 调仓敏感性分析结果面板
 * @description 散点图 / 分布柱图 / 偏移扫描 / 结果表格 四个 Tab。
 *   容器与表格迁移至 shadcn Card + token 化 Tailwind；图表逻辑保持不变。
 */
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
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
import { Card } from '@/components/ui/card';
import { fmtPct } from '@/utils/format';

/** 原生 select 复用的 token 化样式（紧凑高度） */
const selectClassName =
  'flex h-9 w-32 rounded-md border border-border bg-input-bg px-3 text-body text-fg transition-colors hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15';

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
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis
          type="number"
          dataKey="volatility"
          name={t('rebalancingSensitivity.results.volatility')}
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{
            value: t('rebalancingSensitivity.results.volatilityAxis'),
            position: 'insideBottom',
            offset: -15,
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <YAxis
          type="number"
          dataKey="cagr"
          name="CAGR"
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          label={{
            value: t('rebalancingSensitivity.results.cagrAxis'),
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <ZAxis type="number" dataKey="sharpe" range={[60, 200]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(v: number, name: string) =>
            name === 'sharpe' || name === 'sortino' ? v.toFixed(2) : `${v.toFixed(2)}%`
          }
        />
        {data.map((p) => (
          <Scatter key={p.label} data={[p]} fill={p.color} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
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
      <span className="text-body text-fg-tertiary">
        {t('rebalancingSensitivity.results.frequency')}:
      </span>
      <select
        className={selectClassName}
        value={s.offsetFreq}
        onChange={(e) => {
          s.setOffsetFreq(e.target.value as RebalanceFrequency);
          void s.runOffsetScan(e.target.value as RebalanceFrequency);
        }}
      >
        {REBALANCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(`rebalancingSensitivity.freq.${o.value}`)}
          </option>
        ))}
      </select>
      {s.isLoadingOffset && (
        <Loader2 className="size-4 animate-spin text-fg-tertiary" />
      )}
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
  ['CAGR', 'cagr'] as const,
  [t('rebalancingSensitivity.results.volatility'), 'stdev'] as const,
  [t('rebalancingSensitivity.results.maxDrawdown'), 'mdd'] as const,
  [t('rebalancingSensitivity.results.sharpe'), 'sharpe'] as const,
  ['Sortino', 'sortino'] as const,
];

function ResultsTableHead() {
  const { t } = useTranslation();
  const cols = resultsTableCols(t);
  return (
    <thead>
      <tr className="bg-input-bg">
        <th className="border-b-2 border-subtle px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
          {t('rebalancingSensitivity.results.frequency')}
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

/** 表格单元格基础类 + 最优值高亮 */
function cellClassName(isBest: boolean): string {
  return `border-b border-subtle px-3 py-2 text-right font-mono text-label font-medium ${
    isBest ? 'font-bold text-success' : 'text-fg'
  }`;
}

function ResultsTable({ results }: { results: FreqResult[] }) {
  const best = {
    cagr: Math.max(...results.map((x) => x.cagr)),
    stdev: Math.min(...results.map((x) => x.stdev)),
    mdd: Math.min(...results.map((x) => x.maxDrawdown)),
    sharpe: Math.max(...results.map((x) => x.sharpe)),
    sortino: Math.max(...results.map((x) => x.sortino)),
  };
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
              <td className={cellClassName(r.cagr === best.cagr)}>{fmtPct(r.cagr)}</td>
              <td className={cellClassName(r.stdev === best.stdev)}>{fmtPct(r.stdev)}</td>
              <td className={cellClassName(r.maxDrawdown === best.mdd)}>
                {fmtPct(r.maxDrawdown)}
              </td>
              <td className={cellClassName(r.sharpe === best.sharpe)}>
                {r.sharpe.toFixed(2)}
              </td>
              <td className={cellClassName(r.sortino === best.sortino)}>
                {r.sortino.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ResultsPanel: 调仓敏感性结果面板，含错误/空/加载态与四 Tab 切换。
 * @param s - 页面状态。
 * @returns 结果面板元素。
 */
export function ResultsPanel({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  if (s.error)
    return (
      <Card className="p-6 text-center text-danger">
        {t('rebalancingSensitivity.results.analysisFailed')}: {s.error}
      </Card>
    );
  if (s.results.length === 0 && !s.isLoading)
    return (
      <Card className="p-12 text-center text-fg-tertiary">
        {t('rebalancingSensitivity.results.noResultsHint')}
      </Card>
    );
  if (s.isLoading)
    return (
      <Card className="p-10 text-center">
        <Loader2 className="inline-block size-6 animate-spin text-fg-tertiary" />
      </Card>
    );
  return (
    <Card className="p-5">
      <div className="mb-4 flex gap-2 border-b-2 border-subtle pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => s.setActiveTab(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors ${
              s.activeTab === tab.key
                ? 'bg-brand/10 text-brand'
                : 'text-fg-tertiary hover:text-fg-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {s.activeTab === 'scatter' && <ScatterTab results={s.results} />}
      {s.activeTab === 'distributions' && <DistributionTab results={s.results} />}
      {s.activeTab === 'offset' && <OffsetTab s={s} />}
      {s.activeTab === 'table' && <ResultsTable results={s.results} />}
    </Card>
  );
}
