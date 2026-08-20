import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Save, FolderOpen, Trash2, Loader2, Search } from 'lucide-react';
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
import { SimpleTable, SortableTable, type TableColumn } from '@/components/tables';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart';
import { fmtPct } from '@/utils/format';
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
import { useTacticalConfigs, type TacticalConfigPayload } from './useTacticalConfigs';
import { ParamSection, SignalBuilderSection } from './TacticalSignalEditor';
import { BacktestParamsFields } from './sharedBacktestParams';
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
      <BacktestParamsFields idPrefix="tactical" state={state} />
      <RunButton
        isLoading={isLoading}
        onClick={handleRunBacktest}
        label={t('Run Tactical Backtest')}
        loadingLabel={t('Backtesting...')}
      />
    </div>
  );
}
function SignalHistoryTable({
  signalHistory,
}: {
  signalHistory: TacticalBacktestResult['signalHistory'];
}) {
  const { t } = useTranslation();
  const columns: TableColumn<(typeof signalHistory)[number]>[] = [
    { key: 'date', label: t('Date') },
    {
      key: 'activeSignals',
      label: t('Active Signals'),
      render: (h) =>
        h.activeSignals.length > 0 ? (
          h.activeSignals.join(', ')
        ) : (
          <span className="text-fg-tertiary">{t('None (Equal Weight)')}</span>
        ),
    },
    {
      key: 'weights',
      label: t('Target Weights'),
      align: 'right',
      render: (h) => h.weights.map((w) => `${w.ticker}: ${fmtPct(w.weight, 1)}`).join('  '),
    },
  ];
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">{t('Signal Switching History (Rebalance Days)')}</h3>
      <div className="max-h-[400px] overflow-auto">
        <SimpleTable columns={columns} data={signalHistory} rowKey={(_, idx) => String(idx)} />
      </div>
    </Card>
  );
}
function WhatIfTab({ strategy }: { strategy: TacticalStrategy }) {
  const { t } = useTranslation();
  const [tickerInput, setTickerInput] = useState('SPY, TLT, GLD');
  const [results, setResults] = useState<WhatIfResult[]>([]);
  const { isLoading, error, run, setError } = useAsyncAction();
  const columns: TableColumn<WhatIfResult>[] = [
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
      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-fg">{t('Growth Curve')}</h3>
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
      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-fg">{t('Statistics')}</h3>
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
            {results ? (
              <BacktestResultTab results={results} />
            ) : (
              <EmptyState
                icon={LineChart}
                title={t(
                  'Configure signals and parameters, then click "Run Tactical Backtest" to see results',
                )}
                className="py-16"
              />
            )}
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
