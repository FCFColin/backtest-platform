/* eslint-disable @typescript-eslint/no-explicit-any -- 动态表格/图表需 any */
import { useEffect, useState, useId } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { fmtPct, fmtRatio, fmtAmount, downsample } from '@/utils/format';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import type { SignalAnalysisResult } from '@backtest/shared/types/signal';
import { ResultsSection, StatCard } from '@/components/cards';
import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  PortfolioLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/uiComponents.js';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { DateField, LabeledField, RunButton } from '@/components/form/sharedFields';
import {
  SortableTable,
  type TableColumn,
  SimpleTable,
  type SimpleTableColumn,
} from '../../components/tables.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import {
  useSignalAnalyzerState,
  useDualSignalState,
  useMultiSignalState,
  type UseSignalAnalyzerStateResult,
  type UseDualSignalStateResult,
  type UseMultiSignalStateResult,
  type DualSignalResponse,
  type MultiSignalResponse,
  type SignalDir,
  type AggregationMethod,
  type ResultsPanelProps,
} from './signalState.js';
import {
  SignalAnalyzerParamsPanel,
  DualSignalParamsPanel,
  IndicatorSelect,
} from './SignalParamsPanel.js';
const AGG: { value: AggregationMethod; label: string; desc: string }[] = [
  {
    value: 'weighted',
    label: 'signal.multi.aggregationWeighted',
    desc: 'signal.multi.descWeighted',
  },
  { value: 'voting', label: 'signal.multi.aggregationVoting', desc: 'signal.multi.descVoting' },
  { value: 'rank', label: 'signal.multi.aggregationRank', desc: 'signal.multi.descRank' },
];
const ROW_CLS = 'h-9 w-16 font-mono tabular-nums';
const STAT_COLS: { key: string; label: string; fmt: 'int' | 'pct' | 'ratio' }[] = [
  { key: 'totalSignals', label: 'signal.dual.statTotalSignals', fmt: 'int' },
  { key: 'winRate', label: 'Win Rate', fmt: 'pct' },
  { key: 'avgReturn', label: 'Average Return', fmt: 'pct' },
  { key: 'maxDrawdown', label: 'Max Drawdown', fmt: 'pct' },
  { key: 'sharpe', label: 'backtest.sharpeRatio', fmt: 'ratio' },
];
const PAGE_SIZE = 100;
function renderDir(d: SignalDir, t: TFunction) {
  if (d === 'buy') return <span className="font-semibold text-success">{t('Buy')}</span>;
  if (d === 'sell') return <span className="font-semibold text-danger">{t('Sell')}</span>;
  return <span className="text-fg-tertiary">-</span>;
}
const StatCardGrid = ({ items }: { items: { label: string; value: string }[] }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
    {items.map((r) => (
      <StatCard key={r.label} label={r.label} value={r.value} />
    ))}
  </div>
);
const toItems = (s: Record<string, number>, t: TFunction) =>
  STAT_COLS.map((c) => ({
    label: t(c.label),
    value:
      c.fmt === 'int' ? String(s[c.key]) : c.fmt === 'pct' ? fmtPct(s[c.key]) : fmtRatio(s[c.key]),
  }));
function buildEq(r: DualSignalResponse) {
  const m = new Map<string, Record<string, number | string>>();
  const a = [
    { k: 'signal1', c: r.signal1.equityCurve },
    { k: 'signal2', c: r.signal2.equityCurve },
    { k: 'combined', c: r.combined.equityCurve },
  ];
  for (const s of a)
    for (const p of s.c) {
      if (!m.has(p.date)) m.set(p.date, { date: p.date });
      m.get(p.date)![s.k] = p.value;
    }
  return [...m.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));
}
const dirCol = (
  k: 'signal1' | 'signal2' | 'combined',
  label: string,
  t: TFunction,
): TableColumn<DualSignalResponse['comparison'][number]> => ({
  key: k,
  label,
  render: (r) => renderDir(r[k], t),
  sortValue: (r) => r[k] ?? '',
});
const typeCell = (r: { type: 'buy' | 'sell' }, t: TFunction) => (
  <span className={r.type === 'buy' ? 'text-success font-semibold' : 'text-danger font-semibold'}>
    {r.type === 'buy' ? t('Buy') : t('Sell')}
  </span>
);
const mk = (k: string, l: string, r: (x: any) => any, s: (x: any) => any) =>
  ({ key: k, label: l, render: r, sortValue: s }) as TableColumn<any>;
function DualSignalResultsPanel({
  results,
  error,
  isLoading,
}: ResultsPanelProps<DualSignalResponse>) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [results]);
  const cmp = results ? results.comparison.filter((r) => r.signal1 || r.signal2 || r.combined) : [];
  const rows = results
    ? [
        { name: t('Signal 1'), stats: results.signal1.statistics },
        { name: t('Signal 2'), stats: results.signal2.statistics },
        { name: t('Combined Signal'), stats: results.combined.statistics },
      ]
    : [];
  const eq = results ? buildEq(results) : [];
  const cmpCols: TableColumn<DualSignalResponse['comparison'][number]>[] = [
    { key: 'date', label: t('Date'), sortValue: (r) => r.date },
    dirCol('signal1', t('Signal 1'), t),
    dirCol('signal2', t('Signal 2'), t),
    dirCol('combined', t('Combined Signal'), t),
  ];
  const statCols: SimpleTableColumn<(typeof STAT_COLS)[number]>[] = [
    { key: 'metric', label: t('Metric'), render: (c) => t(c.label) },
    ...rows.map((r, i) => ({
      key: `s${i}`,
      label: <PortfolioLabel color={getPortfolioColor(i)} name={r.name} />,
      align: 'right' as const,
      render: (c: (typeof STAT_COLS)[number]) => {
        const v = (r.stats as Record<string, number>)[c.key];
        return c.fmt === 'int' ? String(v) : c.fmt === 'pct' ? fmtPct(v) : fmtRatio(v);
      },
    })),
  ];
  const total = Math.ceil(cmp.length / PAGE_SIZE);
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      <div className="flex flex-col gap-4">
        <ResultsSection title={t('Combined Signal Stats vs Single Signal Stats')}>
          <SimpleTable columns={statCols} data={STAT_COLS} rowKey={(r) => r.key} />
        </ResultsSection>
        <ResultsSection title={t('Signal Comparison ({{count}})', { count: cmp.length })}>
          {cmp.length > 0 ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-2 text-caption text-fg-tertiary">
                <span>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, cmp.length)} /{' '}
                  {cmp.length}
                </span>
                <span className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    {t('Prev')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
                    disabled={page >= total - 1}
                  >
                    {t('Next')}
                  </Button>
                </span>
              </div>
              <SortableTable
                columns={cmpCols}
                data={cmp.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)}
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
            series={[
              { dataKey: 'signal1', legendName: t('Sig1'), strokeWidth: 1.5 },
              { dataKey: 'signal2', legendName: t('Sig2'), strokeWidth: 1.5 },
              { dataKey: 'combined', legendName: t('Portfolio'), strokeWidth: 2.5 },
            ]}
            tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
          />
        </ResultsSection>
      </div>
    </ResultsShell>
  );
}
function SignalAnalyzerResultsPanel({
  error,
  results,
  isLoading,
  onRetry,
}: ResultsPanelProps<SignalAnalysisResult> & { onRetry?: () => void }) {
  const { t } = useTranslation();
  const cols: TableColumn<{ date: string; type: 'buy' | 'sell'; price: number }>[] = [
    { key: 'date', label: t('Date'), sortValue: (r) => r.date },
    { key: 'type', label: t('Type'), sortValue: (r) => r.type, render: (r) => typeCell(r, t) },
    {
      key: 'price',
      label: t('Price'),
      render: (r) => fmtAmount(r.price),
      sortValue: (r) => r.price,
    },
  ];
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
      onRetry={onRetry}
    >
      {results && (
        <div className="flex flex-col gap-4">
          <StatCardGrid items={toItems(results.statistics as any, t)} />
          <Tabs defaultValue="signals">
            <TabsList>
              <TabsTrigger value="signals">
                {t('Signal List ({{count}})', { count: results.signals.length })}
              </TabsTrigger>
              <TabsTrigger value="equity">{t('Equity Curve')}</TabsTrigger>
            </TabsList>
            <TabsContent value="signals">
              {results.signals.length > 0 ? (
                <SortableTable
                  columns={cols}
                  data={results.signals}
                  initialSortKey="date"
                  initialSortDir="asc"
                />
              ) : (
                <TableEmpty message={t('No signals generated for the current parameters')} />
              )}
            </TabsContent>
            <TabsContent value="equity">
              <TimeSeriesLineChart
                data={downsample(results.equityCurve, 400)}
                referenceY={10000}
                series={[{ dataKey: 'value', legendName: t('Equity') }]}
                tooltipValueFormatter={(v) => [fmtAmount(v), t('Equity')]}
                tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ResultsShell>
  );
}
function MultiSignalResultsPanel({
  results,
  error,
  isLoading,
}: ResultsPanelProps<MultiSignalResponse>) {
  const { t } = useTranslation();
  const cols: TableColumn<MultiSignalResponse['contributions'][number]>[] = [
    { key: 'index', label: '#', sortValue: (r) => r.index },
    { key: 'indicator', label: t('Metric'), sortValue: (r) => r.indicator },
    mk(
      'contribution',
      t('Contribution (Avg Return)'),
      (r: any) => fmtPct(r.contribution),
      (r: any) => r.contribution,
    ),
    mk(
      'winRate',
      t('Win Rate'),
      (r: any) => fmtPct(r.statistics.winRate),
      (r: any) => r.statistics.winRate,
    ),
    mk(
      'totalSignals',
      t('Signals'),
      (r: any) => String(r.statistics.totalSignals),
      (r: any) => r.statistics.totalSignals,
    ),
  ];
  return (
    <ResultsShell
      error={error}
      errorPrefix={t('Analysis failed: ')}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      <div className="flex flex-col gap-4">
        <ResultsSection title={t('Aggregated Signal Statistics')}>
          {results && <StatCardGrid items={toItems(results.aggregated.statistics as any, t)} />}
        </ResultsSection>
        <ResultsSection title={t('Signal Contribution Comparison')}>
          {results!.contributions.length > 0 ? (
            <SortableTable
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
          <TimeSeriesLineChart
            data={downsample(results?.aggregated.equityCurve ?? [], 400)}
            referenceY={10000}
            series={[{ dataKey: 'value', legendName: t('Aggregated Equity') }]}
            tooltipValueFormatter={(v) => [fmtAmount(v), t('Equity')]}
            tooltipLabelFormatter={(label) => `${t('Date')}: ${label}`}
          />
        </ResultsSection>
      </div>
    </ResultsShell>
  );
}
export default function SignalAnalyzerPage() {
  return (
    <ComputeToolShell
      config={
        {
          titleKey: 'signal.analyzer.title',
          params: ({ state }) => <SignalAnalyzerParamsPanel state={state} />,
          results: ({ state }) => (
            <SignalAnalyzerResultsPanel
              error={state.error}
              results={state.results}
              isLoading={state.isLoading}
              onRetry={state.runAnalysis}
            />
          ),
        } as ComputeToolConfig<UseSignalAnalyzerStateResult>
      }
      state={useSignalAnalyzerState()}
    />
  );
}
export function DualSignalPage() {
  return (
    <ComputeToolShell
      config={
        {
          titleKey: 'signal.dual.title',
          params: ({ state }) => <DualSignalParamsPanel state={state} />,
          results: ({ state }) => (
            <DualSignalResultsPanel
              results={state.results}
              error={state.error}
              isLoading={state.isLoading}
            />
          ),
        } as ComputeToolConfig<UseDualSignalStateResult>
      }
      state={useDualSignalState()}
    />
  );
}
function MultiSignalParams({ state }: { state: UseMultiSignalStateResult }) {
  const { t } = useTranslation();
  const tid = useId(),
    sid = useId(),
    eid = useId();
  const {
    signals,
    weights,
    aggregationMethod,
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
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-2 rounded-md bg-input-bg/50 p-3 hover:bg-hover"
          >
            <IndicatorSelect
              value={s.indicator}
              onChange={(v) => updateSignal(s.id, { indicator: v })}
              triggerClassName="h-9 w-[120px]"
            />
            <Input
              type="number"
              className={ROW_CLS}
              value={s.period}
              min={2}
              title={t('Period')}
              onChange={(e) => updateSignal(s.id, { period: Number(e.target.value) })}
            />
            <Input
              type="number"
              className={ROW_CLS}
              value={s.threshold}
              title={t('Threshold')}
              onChange={(e) => updateSignal(s.id, { threshold: Number(e.target.value) })}
            />
            {aggregationMethod === 'weighted' && (
              <Input
                type="number"
                step="0.1"
                className={`${ROW_CLS} w-[72px]`}
                value={weights[i] ?? 0}
                title={t('Weight')}
                onChange={(e) => updateWeight(i, Number(e.target.value))}
              />
            )}
            {signals.length > 1 && (
              <Button
                variant="destructive"
                size="icon"
                className="h-9 w-9"
                onClick={() => removeSignal(s.id)}
                title={t('Remove')}
                aria-label={t('Remove')}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
        <Button variant="secondary" size="sm" className="w-fit" onClick={addSignal}>
          <Plus className="size-4" />
          {t('Add Signal')}
        </Button>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('Aggregation Config')}</h3>
        <Field>
          <FieldLabel>{t('Aggregation Method')}</FieldLabel>
          <RadioGroup
            value={aggregationMethod}
            onValueChange={(v) => setAggregationMethod(v as AggregationMethod)}
            className="grid grid-cols-3 gap-3"
          >
            {AGG.map((m) => (
              <div key={m.value} className="flex items-center gap-2">
                <RadioGroupItem value={m.value} id={`agg-${m.value}`} />
                <Label htmlFor={`agg-${m.value}`}>{t(m.label)}</Label>
              </div>
            ))}
          </RadioGroup>
          <FieldDescription>
            {t(AGG.find((m) => m.value === aggregationMethod)!.desc)}
          </FieldDescription>
        </Field>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-h3 text-fg">{t('Backtest Parameters')}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <LabeledField htmlFor={tid} label={t('Ticker')}>
            <Input
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
export function MultiSignalPage() {
  return (
    <ComputeToolShell
      config={
        {
          titleKey: 'signal.multi.title',
          params: ({ state }) => <MultiSignalParams state={state} />,
          results: ({ state }) => (
            <MultiSignalResultsPanel
              results={state.results}
              error={state.error}
              isLoading={state.isLoading}
            />
          ),
        } as ComputeToolConfig<UseMultiSignalStateResult>
      }
      state={useMultiSignalState()}
    />
  );
}
