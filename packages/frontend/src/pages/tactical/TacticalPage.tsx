import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Save, FolderOpen, Trash2, Loader2, Search, Grid3x3 } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/uiComponents';
import { LabeledField, RunButton, SelectField } from '@/components/form/sharedFields';
import { ErrorBanner, EmptyState } from '@/components/stateDisplay';
import { SortableTable, type TableColumn } from '@/components/tables';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart';
import { ResultsShell } from '@/components/resultsShell';
import { fmtPct, fmtNum, fmtAmount } from '@/utils/format';
import { useAsyncAction } from '@/hooks/miscHooks';
import { apiPostJSON } from '@/utils/apiClient';
import { normalizeTicker } from '@/utils/ticker';
import {
  buildGrowthData,
  buildStatRows,
  fmtPrice,
  whatIfSignalColor,
  whatIfSignalLabel,
  type StatRow,
} from './tacticalResultUtils';
import {
  computeHeatmapRange,
  getCellDisplayValue,
  getHeatmapColor,
  getHeatmapTextColor,
  getObjectiveLabelKey,
} from './tacticalGridUtils';
import type { HeatmapData, TacticalGridResponse, TopCombinationResult } from './tacticalGridUtils';
import {
  TABS,
  useTacticalPageState,
  AGGREGATION_OPTIONS,
  RANKING_METHOD_OPTIONS,
} from './TacticalUtils';
import type {
  TacticalBacktestResult,
  WhatIfResult,
  TacticalStrategy,
} from '@backtest/shared/types/tactical';
import type { TFunction } from 'i18next';
import { useTacticalConfigs, type TacticalConfigPayload } from './useTacticalConfigs';
import { ParamSection, SignalBuilderSection } from './TacticalSignalEditor';
import { BacktestParamsFields } from './sharedBacktestParams';
import { GridParamsPanel } from './TacticalGridParams.js';
import { useTacticalGridState } from '@/hooks/useTacticalGridState.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
type TacticalPageState = ReturnType<typeof useTacticalPageState>;
function AggregationSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { strategy, setStrategy } = state;
  return (
    <ParamSection title={t('Aggregation Config')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t('Aggregation Method')}
          value={strategy.aggregationMethod}
          onChange={(v) =>
            setStrategy({
              ...strategy,
              aggregationMethod: v as TacticalStrategy['aggregationMethod'],
            })
          }
          options={AGGREGATION_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
        {strategy.aggregationMethod === 'rank' && (
          <>
            <SelectField
              label={t('Ranking Method')}
              value={strategy.rankingConfig?.method ?? 'fixed_share'}
              onChange={(v) =>
                setStrategy({
                  ...strategy,
                  rankingConfig: {
                    method: v as 'fixed_share' | 'risk_parity',
                    topN: strategy.rankingConfig?.topN ?? 3,
                  },
                })
              }
              options={RANKING_METHOD_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
            />
            <LabeledField label="TopN">
              <Input
                type="number"
                min={1}
                value={strategy.rankingConfig?.topN ?? 3}
                onChange={(e) =>
                  setStrategy({
                    ...strategy,
                    rankingConfig: {
                      method: strategy.rankingConfig?.method ?? 'fixed_share',
                      topN: Math.max(1, Number(e.target.value)),
                    },
                  })
                }
              />
            </LabeledField>
          </>
        )}
      </div>
    </ParamSection>
  );
}
function BacktestParamsSection({ state }: { state: TacticalPageState }) {
  return <BacktestParamsFields idPrefix="tactical" state={state} />;
}
function applyTacticalConfig(state: TacticalPageState, config: TacticalConfigPayload) {
  state.setStrategy(config.strategy);
  state.setStartDate(config.startDate);
  state.setEndDate(config.endDate);
  state.setStartingValue(config.startingValue);
  state.setRebalanceFrequency(config.rebalanceFrequency);
}
function ConfigPersistenceSection({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { configs, save, remove } = useTacticalConfigs();
  const [configName, setConfigName] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!configName.trim()) return;
    setSaving(true);
    const payload: TacticalConfigPayload = {
      strategy: state.strategy,
      startDate: state.startDate,
      endDate: state.endDate,
      startingValue: state.startingValue,
      rebalanceFrequency: state.rebalanceFrequency,
    };
    await save(configName.trim(), payload);
    setConfigName('');
    setSaving(false);
  };
  return (
    <ParamSection title={t('Saved Configurations')}>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          className="flex-1"
          value={configName}
          onChange={(e) => setConfigName(e.target.value)}
          placeholder={t('Configuration name...')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving || !configName.trim()}
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
          {t('Save')}
        </Button>
      </div>
      {configs.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {configs.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border-subtle px-2 py-1.5"
            >
              <FolderOpen className="size-3.5 shrink-0 text-fg-tertiary" />
              <button
                className="flex-1 text-left text-caption text-fg hover:text-fg-primary"
                onClick={() => applyTacticalConfig(state, c.config as TacticalConfigPayload)}
              >
                {c.name}
              </button>
              <span className="text-caption text-fg-tertiary">
                {new Date(c.updatedAt).toLocaleDateString()}
              </span>
              <Button
                variant="icon"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => void remove(c.id)}
                title={t('Delete configuration')}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </ParamSection>
  );
}
function TacticalParamsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { isLoading, handleRunBacktest } = state;
  return (
    <div className="flex flex-col gap-4">
      <ConfigPersistenceSection state={state} />
      <SignalBuilderSection state={state} />
      <AggregationSection state={state} />
      <BacktestParamsSection state={state} />
      <RunButton
        isLoading={isLoading}
        onClick={handleRunBacktest}
        label={t('Run Tactical Backtest')}
        loadingLabel={t('Backtesting...')}
      />
    </div>
  );
}
function buildWhatIfColumns(t: TFunction): TableColumn<WhatIfResult>[] {
  return [
    { key: 'ticker', label: t('Ticker'), sortValue: (r) => r.ticker },
    {
      key: 'currentPrice',
      label: t('Latest Price'),
      sortValue: (r) => r.currentPrice,
      render: (r) => <span className="font-mono tabular-nums">{fmtPrice(r.currentPrice)}</span>,
    },
    { key: 'signalDate', label: t('Signal Date'), sortValue: (r) => r.signalDate },
    {
      key: 'signalType',
      label: t('Signal Status'),
      sortValue: (r) => r.signalType,
      render: (r) => (
        <span className="font-semibold" style={{ color: whatIfSignalColor(r.signalType) }}>
          {whatIfSignalLabel(r.signalType, t)}
        </span>
      ),
    },
  ];
}
function SignalHistoryTable({
  signalHistory,
}: {
  signalHistory: TacticalBacktestResult['signalHistory'];
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">{t('Signal Switching History (Rebalance Days)')}</h3>
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-elevated">
            <tr>
              <th className="border-b border-border-strong px-3 py-2 text-left text-caption font-semibold text-fg-tertiary">
                {t('Date')}
              </th>
              <th className="border-b border-border-strong px-3 py-2 text-left text-caption font-semibold text-fg-tertiary">
                {t('Active Signals')}
              </th>
              <th className="border-b border-border-strong px-3 py-2 text-right text-caption font-semibold text-fg-tertiary">
                {t('Target Weights')}
              </th>
            </tr>
          </thead>
          <tbody>
            {signalHistory.map((h, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-input-bg/40' : 'bg-transparent'}>
                <td className="border-b border-border-subtle px-3 py-2 text-label font-mono tabular-nums text-fg">
                  {h.date}
                </td>
                <td className="border-b border-border-subtle px-3 py-2 text-label text-fg-secondary">
                  {h.activeSignals.length > 0 ? (
                    h.activeSignals.join(', ')
                  ) : (
                    <span className="text-fg-tertiary">{t('None (Equal Weight)')}</span>
                  )}
                </td>
                <td className="border-b border-border-subtle px-3 py-2 text-right text-label font-mono tabular-nums text-fg">
                  {h.weights.map((w) => `${w.ticker}: ${fmtPct(w.weight, 1)}`).join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function WhatIfTab({ strategy }: { strategy: TacticalStrategy }) {
  const { t } = useTranslation();
  const [tickerInput, setTickerInput] = useState('SPY, TLT, GLD');
  const [results, setResults] = useState<WhatIfResult[]>([]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const columns = buildWhatIfColumns(t);
  const handleQuery = () => {
    const tickers = tickerInput
      .split(/[\s,]+/)
      .map(normalizeTicker)
      .filter(Boolean);
    if (tickers.length === 0) {
      setError(t('Please enter at least one ticker'));
      return;
    }
    run(async () => {
      const data = await apiPostJSON<WhatIfResult[]>(
        '/api/v1/tactical/what-if',
        { tickers, strategy },
        t('Query failed'),
      );
      setResults(data ?? []);
    });
  };
  return (
    <Card className="p-4">
      <h3 className="mb-1 text-h3 text-fg">{t('Real-time Price & Signal Query')}</h3>
      <p className="mb-3 text-caption text-fg-tertiary">
        {t(
          'Enter tickers (comma or space separated) to query latest prices and current strategy signal status',
        )}
      </p>
      <div className="mb-3 flex gap-2">
        <Input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value)}
          placeholder={t('e.g. SPY, TLT, GLD')}
          className="flex-1"
        />
        <Button variant="primary" onClick={handleQuery} disabled={isLoading}>
          <Search className="size-4" />
          {isLoading ? t('Querying...') : t('Query')}
        </Button>
      </div>
      {error && <p className="mb-3 text-caption text-danger">{error}</p>}
      {results.length > 0 && (
        <SortableTable
          columns={columns}
          data={results}
          initialSortKey="ticker"
          initialSortDir="asc"
        />
      )}
      {results.length === 0 && !error && !isLoading && (
        <EmptyState title={t('Enter tickers and click "Query" to see results')} className="py-10" />
      )}
    </Card>
  );
}
type StatTone = 'brand' | 'success' | 'default';
type ParamLabels = { p1: string; p2: string };
type GridSectionProps = { results: TacticalGridResponse; paramLabels: ParamLabels };
const HEATMAP_TH =
  'sticky top-0 z-10 min-w-[56px] border-b-2 border-r border-border-subtle bg-elevated px-2 py-1.5 text-caption font-semibold text-fg-tertiary';
const TONE_CLASS: Record<StatTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  default: 'text-fg',
};
function ResultsSummary({ results, paramLabels }: GridSectionProps) {
  const { t } = useTranslation();
  const b = results.bestCombination;
  const stats: Array<{ label: string; value: string | number; tone?: StatTone }> = [
    { label: t('Combinations'), value: results.totalCombinations },
    { label: t('Best {{label}}', { label: paramLabels.p1 }), value: b?.param1 ?? '—' },
    { label: t('Best {{label}}', { label: paramLabels.p2 }), value: b?.param2 ?? '—' },
    { label: t('Best CAGR'), value: b ? fmtPct(b.cagr) : '—', tone: 'success' },
    { label: t('Best Sharpe'), value: b ? fmtNum(b.sharpe, 3) : '—', tone: 'success' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border-subtle bg-input-bg/30 px-3 py-2.5"
        >
          <div className="text-caption text-fg-tertiary">{s.label}</div>
          <div
            className={`mt-0.5 font-mono text-h2 tabular-nums ${TONE_CLASS[s.tone ?? 'default']}`}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
type RankedResult = TopCombinationResult & { rank: number };
function buildTopColumns(
  t: (k: string) => string,
  paramLabels: ParamLabels,
): TableColumn<RankedResult>[] {
  const num = (v: number | string) => <span className="font-mono tabular-nums">{v}</span>;
  const col = (
    key: keyof RankedResult,
    label: string,
    fmt?: (v: number) => string | number,
  ): TableColumn<RankedResult> => ({
    key,
    label,
    sortValue: (r) => r[key] as number,
    render: (r) => num(fmt ? fmt(r[key] as number) : (r[key] as number)),
  });
  return [
    col('rank', '#'),
    col('param1', paramLabels.p1),
    col('param2', paramLabels.p2),
    col('cagr', t('stats.cagr'), fmtPct),
    col('maxDrawdown', t('Max Drawdown'), fmtPct),
    col('sharpe', 'Sharpe', (v) => fmtNum(v, 3)),
    col('stdev', t('Volatility'), fmtPct),
    col('calmar', 'Calmar', (v) => fmtNum(v, 3)),
    col('totalReturn', t('stats.totalReturn'), fmtPct),
  ];
}
function TopCombinationsTable({ results, paramLabels }: GridSectionProps) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('Top {{count}} Combinations', { count: results.topResults.length })}
      </h3>
      <SortableTable
        columns={buildTopColumns(t, paramLabels)}
        data={(results.topResults ?? []).map((r, i) => ({ ...r, rank: i + 1 }))}
        initialSortKey="rank"
        initialSortDir="asc"
      />
    </Card>
  );
}
function BestGrowthChart({ results, paramLabels }: GridSectionProps) {
  const { t } = useTranslation();
  const best = results.bestCombination;
  if (!best || best.growthCurve.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('Best Combination Growth Curve ({{p1Label}}={{p1}}, {{p2Label}}={{p2}})', {
          p1Label: paramLabels.p1,
          p1: best.param1,
          p2Label: paramLabels.p2,
          p2: best.param2,
        })}
      </h3>
      <TimeSeriesLineChart
        data={best.growthCurve}
        height={350}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        tooltipValueFormatter={(value) => [fmtAmount(value), t('Net Value')]}
        series={[{ dataKey: 'value', legendName: t('Portfolio Net Value') }]}
      />
    </Card>
  );
}
function HeatmapCell({
  cell,
  p1,
  p2,
  heatmap,
  range,
  objectiveLabel,
}: {
  cell: number | null;
  p1: number;
  p2: number;
  heatmap: HeatmapData;
  range: { min: number; max: number };
  objectiveLabel: string;
}) {
  const { t } = useTranslation();
  if (cell == null)
    return (
      <td className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center text-caption text-fg-tertiary">
        -
      </td>
    );
  const displayVal = getCellDisplayValue(cell, heatmap.objective);
  return (
    <td
      title={t('{{p1Label}}={{p1}}, {{p2Label}}={{p2}}\n{{objectiveLabel}}: {{value}}', {
        p1Label: heatmap.param1Label,
        p1,
        p2Label: heatmap.param2Label,
        p2,
        objectiveLabel,
        value: displayVal,
      })}
      className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center font-mono text-caption font-semibold tabular-nums"
      style={{
        backgroundColor: getHeatmapColor(cell, range.min, range.max),
        color: getHeatmapTextColor(cell, range.min, range.max),
      }}
    >
      {displayVal}
    </td>
  );
}
function HeatmapLegend({ objectiveLabel }: { objectiveLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-2 text-caption text-fg-tertiary">
      <span>{t('{{label}} Low', { label: objectiveLabel })}</span>
      <div
        className="h-3 w-28 rounded-sm"
        style={{
          background:
            'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))',
        }}
      />
      <span>{t('{{label}} High', { label: objectiveLabel })}</span>
    </div>
  );
}
function HeatmapView({ heatmap }: { heatmap: HeatmapData }) {
  const { t } = useTranslation();
  const { param1Values, param2Values, matrix } = heatmap;
  const range = computeHeatmapRange(matrix);
  const objLabel = t(getObjectiveLabelKey(heatmap.objective));
  return (
    <div className="overflow-x-auto">
      <table className="my-2 border-collapse text-caption">
        <thead>
          <tr>
            <th className={HEATMAP_TH}>
              {t('{{p1Label}}  {{p2Label}}', {
                p1Label: heatmap.param1Label,
                p2Label: heatmap.param2Label,
              })}
            </th>
            {param2Values.map((p2) => (
              <th key={p2} className={HEATMAP_TH}>
                {p2}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {param1Values.map((p1, i) => (
            <tr key={p1}>
              <td className="border-b border-r border-border-subtle bg-input-bg/40 px-2 py-1.5 text-caption font-semibold text-fg">
                {p1}
              </td>
              {param2Values.map((p2, j) => (
                <HeatmapCell
                  key={p2}
                  cell={matrix[i]?.[j] ?? null}
                  p1={p1}
                  p2={p2}
                  heatmap={heatmap}
                  range={range}
                  objectiveLabel={objLabel}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <HeatmapLegend objectiveLabel={objLabel} />
    </div>
  );
}
function GridResultsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { error, results, isLoading, paramLabels } = state;
  return (
    <ResultsShell
      error={error}
      errorPrefix={`${t('Search failed')}: `}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters above and click "Start Grid Search" to see results')}
      emptyIcon={Grid3x3}
      onRetry={state.runSearch}
    >
      {results && (
        <div className="flex flex-col gap-3">
          <ResultsSummary results={results} paramLabels={paramLabels} />
          {results.heatmap.matrix.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-h3 text-fg">
                {t('Parameter Heatmap ({{p1Label}} × {{p2Label}})', {
                  p1Label: results.heatmap.param1Label,
                  p2Label: results.heatmap.param2Label,
                })}
              </h3>
              <HeatmapView heatmap={results.heatmap} />
            </Card>
          )}
          <TopCombinationsTable results={results} paramLabels={paramLabels} />
          <BestGrowthChart results={results} paramLabels={paramLabels} />
        </div>
      )}
    </ResultsShell>
  );
}
function ChartCardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-h3 text-fg">{children}</h3>;
}
function GrowthChart({ growthData }: { growthData: Array<Record<string, number | string>> }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <ChartCardTitle>{t('Growth Curve')}</ChartCardTitle>
      <TimeSeriesLineChart
        data={growthData}
        height={380}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        series={[
          { dataKey: 'tactical', legendName: t('Tactical') },
          {
            dataKey: 'benchmark',
            legendName: t('Equal Weight'),
            strokeDasharray: '6 3',
          },
        ]}
      />
    </Card>
  );
}
function BacktestResultTab({ results }: { results: TacticalBacktestResult }) {
  const { t } = useTranslation();
  const { portfolio, benchmark, signalHistory } = results;
  const growthData = useMemo(() => buildGrowthData(portfolio, benchmark), [portfolio, benchmark]);
  const statRows = useMemo(() => buildStatRows(portfolio, benchmark, t), [portfolio, benchmark, t]);
  const statColumns: TableColumn<StatRow>[] = [
    { key: 'metric', label: t('Metric') },
    {
      key: 'tactical',
      label: t('Tactical'),
      sortValue: (r) => r._sortTactical,
      render: (r) => <span className="font-mono tabular-nums">{r.tactical}</span>,
    },
    {
      key: 'benchmark',
      label: t('Equal Weight'),
      render: (r) => <span className="font-mono tabular-nums">{r.benchmark}</span>,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <GrowthChart growthData={growthData} />
      <Card className="p-4">
        <ChartCardTitle>{t('Statistics')}</ChartCardTitle>
        <SortableTable
          columns={statColumns}
          data={statRows}
          initialSortKey="tactical"
          initialSortDir="desc"
        />
      </Card>
      {signalHistory.length > 0 && <SignalHistoryTable signalHistory={signalHistory} />}
    </div>
  );
}
function BacktestEmptyState() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={LineChart}
      title={t(
        'Configure signals and parameters, then click "Run Tactical Backtest" to see results',
      )}
      className="py-16"
    />
  );
}
function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { error, activeTab, setActiveTab, results, strategy } = state;
  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={t('Backtest failed: {{error}}', { error })} />}
      <Card className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="backtest">
            {results ? <BacktestResultTab results={results} /> : <BacktestEmptyState />}
          </TabsContent>
          <TabsContent value="whatif">
            <WhatIfTab strategy={strategy} />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
const config: ComputeToolConfig<TacticalPageState> = {
  titleKey: 'tactical.title',
  seoDescKey: 'tactical.seo.desc',
  seoFeatures: [
    { titleKey: 'lumpSumDca.seo.configurableTitle', descKey: 'tactical.seo.configurableDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'tactical.seo.viewableDesc' },
  ],
  relatedTools: [TOOL_LINKS.backtest, TOOL_LINKS.analysis, TOOL_LINKS.optimizer],
  params: TacticalParamsPanel,
  results: TacticalResultsPanel,
};
export default function TacticalPage() {
  const s = useTacticalPageState();
  return <ComputeToolShell config={config} state={s} />;
}
const gridConfig: ComputeToolConfig<TacticalGridState> = {
  titleKey: 'tacticalGrid.title',
  params: GridParamsPanel,
  results: GridResultsPanel,
};
export function TacticalGridPage() {
  const { t } = useTranslation();
  const s = useTacticalGridState(t);
  return <ComputeToolShell config={gridConfig} state={s} />;
}
