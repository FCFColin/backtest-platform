/* eslint-disable @typescript-eslint/no-explicit-any -- 动态表格/图表需 any */
import { useEffect, useState, useId } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { fmtPct, fmtRatio, fmtAmount, downsample } from '@/utils/format';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { ResultsSection, StatCard } from '@/components/cards';
import * as U from '@/components/ui/uiComponents.js';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { DateField, LabeledField, RunButton } from '@/components/form/sharedFields';
import * as T from '../../components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { createComputeToolPage } from '@/components/shells/index.js';
import * as Sig from './signalState.js';
import {
  SignalAnalyzerParamsPanel,
  DualSignalParamsPanel,
  IndicatorSelect,
} from './SignalParamsPanel.js';
const AGG = [
  {
    value: 'weighted',
    label: 'signal.multi.aggregationWeighted',
    desc: 'signal.multi.descWeighted',
  },
  { value: 'voting', label: 'signal.multi.aggregationVoting', desc: 'signal.multi.descVoting' },
  { value: 'rank', label: 'signal.multi.aggregationRank', desc: 'signal.multi.descRank' },
];
const ROW_CLS = 'h-9 w-16 font-mono tabular-nums';
const STAT_COLS = [
  { key: 'totalSignals', label: 'signal.dual.statTotalSignals', fmt: 'int' },
  { key: 'winRate', label: 'Win Rate', fmt: 'pct' },
  { key: 'avgReturn', label: 'Average Return', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'backtest.sharpeRatio', fmt: 'ratio' },
];
const BUY_CLS = 'font-semibold text-success',
  SELL_CLS = 'font-semibold text-danger',
  NONE_CLS = 'text-fg-tertiary',
  PAG_CLS =
    'flex items-center justify-between border-b border-border px-4 py-2 text-caption text-fg-tertiary',
  SIG_ROW_CLS = 'flex flex-wrap items-center gap-2 rounded-md bg-input-bg/50 p-3 hover:bg-hover',
  GRID5 = 'grid grid-cols-2 gap-3 md:grid-cols-5',
  GRID3 = 'grid grid-cols-3 gap-3',
  PARAM_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
const SIGS = [
  { k: 'signal1', n: 'Signal 1', g: 'Sig1', w: 1.5 },
  { k: 'signal2', n: 'Signal 2', g: 'Sig2', w: 1.5 },
  { k: 'combined', n: 'Combined Signal', g: 'Portfolio', w: 2.5 },
] as const;
const StatCardGrid = ({ items }: { items: { label: string; value: string }[] }) => (
  <div className={GRID5}>
    {items.map((r) => (
      <StatCard key={r.label} label={r.label} value={r.value} />
    ))}
  </div>
);
const fmtStat = (v: number | undefined, f: string) =>
  f === 'int' ? String(v) : f === 'pct' ? fmtPct(v) : fmtRatio(v);
const toItems = (s: Record<string, number>, t: TFunction) =>
  STAT_COLS.map((c) => ({ label: t(c.label), value: fmtStat(s[c.key], c.fmt) }));
const dirCol = (
  k: 'signal1' | 'signal2' | 'combined',
  l: string,
  t: TFunction,
): T.TableColumn<Sig.DualSignalResponse['comparison'][number]> => ({
  key: k,
  label: l,
  render: (r) =>
    r[k] === 'buy' ? (
      <span className={BUY_CLS}>{t('Buy')}</span>
    ) : r[k] === 'sell' ? (
      <span className={SELL_CLS}>{t('Sell')}</span>
    ) : (
      <span className={NONE_CLS}>-</span>
    ),
  sortValue: (r) => r[k] ?? '',
});
const mk = (k: string, l: string, g: (r: any) => any, f: (v: any) => any) =>
  ({ key: k, label: l, render: (r: any) => f(g(r)), sortValue: g }) as T.TableColumn<any>;
const EquityChart = ({
  d,
  name,
  t,
}: {
  d: SignalAnalysisResult['equityCurve'];
  name: string;
  t: TFunction;
}) => (
  <TimeSeriesLineChart
    data={downsample(d, 400)}
    referenceY={10000}
    series={[{ dataKey: 'value', legendName: name }]}
    tooltipValueFormatter={(v) => [fmtAmount(v), t('Equity')]}
    tooltipLabelFormatter={(l) => `${t('Date')}: ${l}`}
  />
);
const shellProps = (t: TFunction, e: string | null, r: unknown, l: boolean) => ({
  error: e,
  errorPrefix: t('Analysis failed: '),
  isLoading: l,
  hasResults: !!r,
  emptyTitle: t('Set parameters and click "Run Analysis" to view results'),
});
function DualSignalResultsPanel({ state }: { state: Sig.UseDualSignalStateResult }) {
  const { t } = useTranslation();
  const { results, error, isLoading } = state;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [results]);
  const cmp = results ? results.comparison.filter((r) => r.signal1 || r.signal2 || r.combined) : [];
  const rows = results
    ? SIGS.map(({ k, n }) => ({ name: t(n), stats: results[k].statistics }))
    : [];
  const eq = (() => {
    const m = new Map<string, Record<string, number | string>>();
    for (const { k } of SIGS)
      for (const p of results?.[k].equityCurve ?? []) {
        if (!m.has(p.date)) m.set(p.date, { date: p.date });
        m.get(p.date)![k] = p.value;
      }
    return [...m.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));
  })();
  const cmpCols = [
    { key: 'date', label: t('Date'), sortValue: (r: any) => r.date },
    ...SIGS.map(({ k, n }) => dirCol(k, t(n), t)),
  ];
  const statCols = [
    { key: 'metric', label: t('Metric'), render: (c: any) => t(c.label) },
    ...rows.map((r, i) => ({
      key: `s${i}`,
      label: <U.PortfolioLabel color={getPortfolioColor(i)} name={r.name} />,
      align: 'right' as const,
      render: (c: (typeof STAT_COLS)[number]) =>
        fmtStat((r.stats as Record<string, number>)[c.key], c.fmt),
    })),
  ];
  const NavBtn = (l: string, d: boolean, o: () => void) => (
    <U.Button type="button" variant="ghost" size="sm" onClick={o} disabled={d}>
      {l}
    </U.Button>
  );
  const total = Math.ceil(cmp.length / 100);
  return (
    <ResultsShell {...shellProps(t, error, results, isLoading)}>
      <div className="flex flex-col gap-4">
        <ResultsSection title={t('Combined Signal Stats vs Single Signal Stats')}>
          <T.SimpleTable columns={statCols} data={STAT_COLS} rowKey={(r) => r.key} />
        </ResultsSection>
        <ResultsSection title={t('Signal Comparison ({{count}})', { count: cmp.length })}>
          {cmp.length > 0 ? (
            <>
              <div className={PAG_CLS}>
                <span>
                  {page * 100 + 1}–{Math.min((page + 1) * 100, cmp.length)} / {cmp.length}
                </span>
                <span className="flex gap-2">
                  {NavBtn(t('Prev'), page === 0, () => setPage((p) => Math.max(0, p - 1)))}
                  {NavBtn(t('Next'), page >= total - 1, () =>
                    setPage((p) => Math.min(total - 1, p + 1)),
                  )}
                </span>
              </div>
              <T.SortableTable
                columns={cmpCols}
                data={cmp.slice(page * 100, (page + 1) * 100)}
                initialSortKey="date"
                initialSortDir="asc"
              />
            </>
          ) : (
            <TableEmpty message={t('No signals generated for the current parameters')} />
          )}
        </ResultsSection>
        <ResultsSection title={t('Equity Curve Comparison')}>
          <TimeSeriesLineChart
            data={downsample(eq, 400)}
            referenceY={10000}
            series={SIGS.map(({ k, g, w }) => ({ dataKey: k, legendName: t(g), strokeWidth: w }))}
            tooltipLabelFormatter={(l) => `${t('Date')}: ${l}`}
          />
        </ResultsSection>
      </div>
    </ResultsShell>
  );
}
function SignalAnalyzerResultsPanel({ state }: { state: Sig.UseSignalAnalyzerStateResult }) {
  const { t } = useTranslation();
  const { error, results, isLoading, runAnalysis } = state;
  const cols = [
    { key: 'date', label: t('Date'), sortValue: (r: any) => r.date },
    {
      key: 'type',
      label: t('Type'),
      sortValue: (r: any) => r.type,
      render: (r: any) => (
        <span className={r.type === 'buy' ? BUY_CLS : SELL_CLS}>
          {r.type === 'buy' ? t('Buy') : t('Sell')}
        </span>
      ),
    },
    {
      key: 'price',
      label: t('Price'),
      render: (r: any) => fmtAmount(r.price),
      sortValue: (r: any) => r.price,
    },
  ];
  return (
    <ResultsShell {...shellProps(t, error, results, isLoading)} onRetry={runAnalysis}>
      {results && (
        <div className="flex flex-col gap-4">
          <StatCardGrid items={toItems(results.statistics as any, t)} />
          <U.Tabs defaultValue="signals">
            <U.TabsList>
              <U.TabsTrigger value="signals">
                {t('Signal List ({{count}})', { count: results.signals.length })}
              </U.TabsTrigger>
              <U.TabsTrigger value="equity">{t('Equity Curve')}</U.TabsTrigger>
            </U.TabsList>
            <U.TabsContent value="signals">
              {results.signals.length > 0 ? (
                <T.SortableTable
                  columns={cols}
                  data={results.signals}
                  initialSortKey="date"
                  initialSortDir="asc"
                />
              ) : (
                <TableEmpty message={t('No signals generated for the current parameters')} />
              )}
            </U.TabsContent>
            <U.TabsContent value="equity">
              <EquityChart d={results.equityCurve} name={t('Equity')} t={t} />
            </U.TabsContent>
          </U.Tabs>
        </div>
      )}
    </ResultsShell>
  );
}
function MultiSignalResultsPanel({ state }: { state: Sig.UseMultiSignalStateResult }) {
  const { t } = useTranslation();
  const { error, results, isLoading } = state;
  const cols = [
    { key: 'index', label: '#', sortValue: (r: any) => r.index },
    { key: 'indicator', label: t('Metric'), sortValue: (r: any) => r.indicator },
    mk('contribution', t('Contribution (Avg Return)'), (r: any) => r.contribution, fmtPct),
    mk('winRate', t('Win Rate'), (r: any) => r.statistics.winRate, fmtPct),
    mk('totalSignals', t('Signals'), (r: any) => r.statistics.totalSignals, String),
  ];
  return (
    <ResultsShell {...shellProps(t, error, results, isLoading)}>
      <div className="flex flex-col gap-4">
        <ResultsSection title={t('Aggregated Signal Statistics')}>
          {results && <StatCardGrid items={toItems(results.aggregated.statistics as any, t)} />}
        </ResultsSection>
        <ResultsSection title={t('Signal Contribution Comparison')}>
          {results!.contributions.length > 0 ? (
            <T.SortableTable
              columns={cols}
              data={results!.contributions}
              initialSortKey="contribution"
              initialSortDir="desc"
            />
          ) : (
            <TableEmpty message={t('No contribution data')} />
          )}
        </ResultsSection>
        <ResultsSection title={t('Equity Curve')}>
          <EquityChart
            d={results?.aggregated.equityCurve ?? []}
            name={t('Aggregated Equity')}
            t={t}
          />
        </ResultsSection>
      </div>
    </ResultsShell>
  );
}
// eslint-disable-next-line react-refresh/only-export-components -- 工厂生成的页面组件
export default createComputeToolPage(Sig.useSignalAnalyzerState, {
  titleKey: 'signal.analyzer.title',
  params: SignalAnalyzerParamsPanel,
  results: SignalAnalyzerResultsPanel,
});
export const DualSignalPage = createComputeToolPage(Sig.useDualSignalState, {
  titleKey: 'signal.dual.title',
  params: DualSignalParamsPanel,
  results: DualSignalResultsPanel,
});
function MultiSignalParams({ state }: { state: Sig.UseMultiSignalStateResult }) {
  const { t } = useTranslation();
  const tid = useId(),
    sid = useId(),
    eid = useId();
  const {
    signals,
    weights,
    aggregationMethod: am,
    addSignal,
    removeSignal,
    updateSignal,
    updateWeight,
    setAggregationMethod,
    ticker,
    startDate,
    endDate,
    setTicker,
    setStartDate,
    setEndDate,
    isLoading,
    runAnalysis,
  } = state;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('Signal List')}</h3>
        <FieldDescription>
          {t('Add multiple technical-indicator signals; each can be removed individually')}
        </FieldDescription>
        {signals.map((s, i) => (
          <div key={s.id} className={SIG_ROW_CLS}>
            <IndicatorSelect
              value={s.indicator}
              onChange={(v) => updateSignal(s.id, { indicator: v })}
              triggerClassName="h-9 w-[120px]"
            />
            <U.Input
              type="number"
              className={ROW_CLS}
              value={s.period}
              min={2}
              title={t('Period')}
              onChange={(e) => updateSignal(s.id, { period: Number(e.target.value) })}
            />
            <U.Input
              type="number"
              className={ROW_CLS}
              value={s.threshold}
              title={t('Threshold')}
              onChange={(e) => updateSignal(s.id, { threshold: Number(e.target.value) })}
            />
            {am === 'weighted' && (
              <U.Input
                type="number"
                step="0.1"
                className={`${ROW_CLS} w-[72px]`}
                value={weights[i] ?? 0}
                title={t('Weight')}
                onChange={(e) => updateWeight(i, Number(e.target.value))}
              />
            )}
            {signals.length > 1 && (
              <U.Button
                variant="destructive"
                size="icon"
                className="h-9 w-9"
                onClick={() => removeSignal(s.id)}
                title={t('Remove')}
                aria-label={t('Remove')}
              >
                <X className="size-4" />
              </U.Button>
            )}
          </div>
        ))}
        <U.Button variant="secondary" size="sm" className="w-fit" onClick={addSignal}>
          <Plus className="size-4" />
          {t('Add Signal')}
        </U.Button>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('Aggregation Config')}</h3>
        <Field>
          <FieldLabel>{t('Aggregation Method')}</FieldLabel>
          <U.RadioGroup
            value={am}
            onValueChange={(v) => setAggregationMethod(v as Sig.AggregationMethod)}
            className={GRID3}
          >
            {AGG.map((m) => (
              <div key={m.value} className="flex items-center gap-2">
                <U.RadioGroupItem value={m.value} id={`agg-${m.value}`} />
                <U.Label htmlFor={`agg-${m.value}`}>{t(m.label)}</U.Label>
              </div>
            ))}
          </U.RadioGroup>
          <FieldDescription>{t(AGG.find((m) => m.value === am)!.desc)}</FieldDescription>
        </Field>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('Backtest Parameters')}</h3>
        <div className={PARAM_GRID}>
          <LabeledField htmlFor={tid} label={t('Ticker')}>
            <U.Input
              id={tid}
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder={t('e.g. SPY')}
            />
          </LabeledField>
          <DateField id={sid} label={t('Start Date')} value={startDate} onChange={setStartDate} />
          <DateField id={eid} label={t('End Date')} value={endDate} onChange={setEndDate} />
        </div>
      </section>
      <RunButton
        isLoading={isLoading}
        label={t('Run Multi-Signal Analysis')}
        loadingLabel={t('Analyzing...')}
        onClick={runAnalysis}
      />
    </div>
  );
}
export const MultiSignalPage = createComputeToolPage(Sig.useMultiSignalState, {
  titleKey: 'signal.multi.title',
  params: MultiSignalParams,
  results: MultiSignalResultsPanel,
});
