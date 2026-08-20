/* eslint-disable @typescript-eslint/no-explicit-any -- ECharts/表格动态构造需 any */
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
type S = ReturnType<typeof useTacticalPageState>;
type P = { state: S };
function AggregationSection({ state: s }: P) {
  const { t } = useTranslation();
  const { strategy: st, setStrategy: setSt } = s;
  const toOpt = (a: any[]) => a.map((o: any) => ({ value: o.value, label: t(o.label) }));
  return (
    <ParamSection title={t('Aggregation Config')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label={t('Aggregation Method')}
          value={st.aggregationMethod}
          onChange={(v) =>
            setSt({ ...st, aggregationMethod: v as TacticalStrategy['aggregationMethod'] })
          }
          options={toOpt(AGGREGATION_OPTIONS)}
        />
        {st.aggregationMethod === 'rank' && (
          <>
            <SelectField
              label={t('Ranking Method')}
              value={st.rankingConfig?.method ?? 'fixed_share'}
              onChange={(v) =>
                setSt({
                  ...st,
                  rankingConfig: {
                    method: v as 'fixed_share' | 'risk_parity',
                    topN: st.rankingConfig?.topN ?? 3,
                  },
                })
              }
              options={toOpt(RANKING_METHOD_OPTIONS)}
            />
            <LabeledField label="TopN">
              <Input
                type="number"
                min={1}
                value={st.rankingConfig?.topN ?? 3}
                onChange={(e) =>
                  setSt({
                    ...st,
                    rankingConfig: {
                      method: st.rankingConfig?.method ?? 'fixed_share',
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
function ConfigPersistenceSection({ state: s }: P) {
  const { t } = useTranslation();
  const { configs, save, remove } = useTacticalConfigs();
  const [n, setN] = useState('');
  const [saving, setSaving] = useState(false);
  const saveCfg = async () => {
    if (!n.trim()) return;
    setSaving(true);
    const { strategy, startDate, endDate, startingValue, rebalanceFrequency } = s;
    await save(n.trim(), { strategy, startDate, endDate, startingValue, rebalanceFrequency });
    setN('');
    setSaving(false);
  };
  return (
    <ParamSection title={t('Saved Configurations')}>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          className="flex-1"
          value={n}
          onChange={(e) => setN(e.target.value)}
          placeholder={t('Configuration name...')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveCfg();
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void saveCfg()}
          disabled={saving || !n.trim()}
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
                onClick={() => {
                  const v = c.config as TacticalConfigPayload;
                  s.setStrategy(v.strategy);
                  s.setStartDate(v.startDate);
                  s.setEndDate(v.endDate);
                  s.setStartingValue(v.startingValue);
                  s.setRebalanceFrequency(v.rebalanceFrequency);
                }}
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
function TacticalParamsPanel({ state: s }: P) {
  const { t } = useTranslation();
  const secs = [ConfigPersistenceSection, SignalBuilderSection, AggregationSection] as const;
  return (
    <div className="flex flex-col gap-4">
      {secs.map((C, i) => (
        <C key={i} state={s} />
      ))}
      <BacktestParamsFields idPrefix="tactical" state={s} />
      <RunButton
        isLoading={s.isLoading}
        onClick={s.handleRunBacktest}
        label={t('Run Tactical Backtest')}
        loadingLabel={t('Backtesting...')}
      />
    </div>
  );
}
function SignalHistoryTable({
  signalHistory: h,
}: {
  signalHistory: TacticalBacktestResult['signalHistory'];
}) {
  const { t } = useTranslation();
  const n = t('None (Equal Weight)');
  const ac = (r: any) =>
    r.activeSignals.length ? (
      r.activeSignals.join(', ')
    ) : (
      <span className="text-fg-tertiary">{n}</span>
    );
  const wc = (r: any) =>
    r.weights.map((w: any) => `${w.ticker}: ${fmtPct(w.weight, 1)}`).join('  ');
  const cols: TableColumn<(typeof h)[number]>[] = [
    { key: 'date', label: t('Date') },
    { key: 'activeSignals', label: t('Active Signals'), render: ac },
    { key: 'weights', label: t('Target Weights'), align: 'right', render: wc },
  ];
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">{t('Signal Switching History (Rebalance Days)')}</h3>
      <div className="max-h-[400px] overflow-auto">
        <SimpleTable columns={cols} data={h} rowKey={(_, i) => String(i)} />
      </div>
    </Card>
  );
}
function WhatIfTab({ strategy: st }: { strategy: TacticalStrategy }) {
  const { t } = useTranslation();
  const [inp, setInp] = useState('SPY, TLT, GLD');
  const [rows, setRows] = useState<WhatIfResult[]>([]);
  const { isLoading: loading, error, run, setError } = useAsyncAction();
  const cc = whatIfSignalColor,
    ll = whatIfSignalLabel;
  const pc = (r: any) => <span className="font-mono tabular-nums">{fmtPrice(r.currentPrice)}</span>;
  const sc = (r: any) => (
    <span className="font-semibold" style={{ color: cc(r.signalType) }}>
      {ll(r.signalType, t)}
    </span>
  );
  const cols: TableColumn<WhatIfResult>[] = [
    { key: 'ticker', label: t('Ticker'), sortValue: (r) => r.ticker },
    { key: 'currentPrice', label: t('Latest Price'), sortValue: (r) => r.currentPrice, render: pc },
    { key: 'signalDate', label: t('Signal Date'), sortValue: (r) => r.signalDate },
    { key: 'signalType', label: t('Signal Status'), sortValue: (r) => r.signalType, render: sc },
  ];
  const q = () => {
    const tickers = inp
      .split(/[\s,]+/)
      .map(normalizeTicker)
      .filter(Boolean);
    if (!tickers.length) return void setError(t('Please enter at least one ticker'));
    run(async () => {
      const d = await apiPostJSON<WhatIfResult[]>(
        '/api/v1/tactical/what-if',
        { tickers, strategy: st },
        t('Query failed'),
      );
      setRows(d ?? []);
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
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          placeholder={t('e.g. SPY, TLT, GLD')}
          className="flex-1"
        />
        <Button variant="primary" onClick={q} disabled={loading}>
          <Search className="size-4" />
          {loading ? t('Querying...') : t('Query')}
        </Button>
      </div>
      {error && <p className="mb-3 text-caption text-danger">{error}</p>}
      {rows.length > 0 && (
        <SortableTable columns={cols} data={rows} initialSortKey="ticker" initialSortDir="asc" />
      )}
      {rows.length === 0 && !error && !loading && (
        <EmptyState title={t('Enter tickers and click "Query" to see results')} className="py-10" />
      )}
    </Card>
  );
}
function BacktestResultTab({ results: r }: { results: TacticalBacktestResult }) {
  const { t } = useTranslation();
  const gd = useMemo(() => buildGrowthData(r.portfolio, r.benchmark), [r.portfolio, r.benchmark]);
  const sr = useMemo(
    () => buildStatRows(r.portfolio, r.benchmark, t),
    [r.portfolio, r.benchmark, t],
  );
  const tc = (x: any) => <span className="font-mono tabular-nums">{x.tactical}</span>;
  const bc = (x: any) => <span className="font-mono tabular-nums">{x.benchmark}</span>;
  const cols: TableColumn<StatRow>[] = [
    { key: 'metric', label: t('Metric') },
    { key: 'tactical', label: t('Tactical'), sortValue: (x) => x._sortTactical, render: tc },
    { key: 'benchmark', label: t('Equal Weight'), render: bc },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-fg">{t('Growth Curve')}</h3>
        <TimeSeriesLineChart
          data={gd}
          height={380}
          tooltipLabelFormatter={(l) => t('Date: {{label}}', { label: l })}
          series={[
            { dataKey: 'tactical', legendName: t('Tactical') },
            { dataKey: 'benchmark', legendName: t('Equal Weight'), strokeDasharray: '6 3' },
          ]}
        />
      </Card>
      <Card className="p-4">
        <h3 className="mb-3 text-h3 text-fg">{t('Statistics')}</h3>
        <SortableTable columns={cols} data={sr} initialSortKey="tactical" initialSortDir="desc" />
      </Card>
      {r.signalHistory.length > 0 && <SignalHistoryTable signalHistory={r.signalHistory} />}
    </div>
  );
}
function TacticalResultsPanel({ state: s }: P) {
  const { t } = useTranslation();
  const { error, activeTab, setActiveTab, results, strategy } = s;
  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={t('Backtest failed: {{error}}', { error })} />}
      <Card className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map((x) => (
              <TabsTrigger key={x.key} value={x.key}>
                {t(x.label)}
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
const cfg: ComputeToolConfig<S> = {
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
  return <ComputeToolShell config={cfg} state={s} />;
}
