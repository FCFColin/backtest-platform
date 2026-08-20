import { useTranslation } from 'react-i18next';
import { REBALANCE_FREQUENCY_OPTIONS } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { fmtAmount } from '@/utils/format';
import {
  ParamsPanel,
  ParamGroup,
  ParamRow,
  ParamCard,
} from '../../components/params/paramsLayout.js';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/uiComponents';
import SinglePortfolioEditor from '@/components/PortfolioEditor.js';
import { RunButton } from '@/components/form/sharedFields';
import { useSettingsStore } from '@/store/settingsStore';
import { StatCard } from '@/components/cards.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { TableEmpty } from '@/components/stateDisplay.js';
import { SortableTable } from '../../components/tables.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import {
  OBJECTIVE_SORT_KEY,
  TABLE_COLUMNS,
  buildBestMetrics,
  buildChartData,
  useOptimizerState,
} from './backtestOptimizerUtils.js';
import type {
  Objective,
  OptimizerFormState,
  OptimizerSectionProps,
  BacktestOptimizerState,
} from './backtestOptimizerUtils.js';

const OBJECTIVE_OPTIONS: Array<{ value: Objective; labelKey: string }> = [
  { value: 'maxCagr', labelKey: 'backtest.optimizer.maxCagr' },
  { value: 'minMaxDrawdown', labelKey: 'backtest.optimizer.minMaxDrawdown' },
  { value: 'maxSharpe', labelKey: 'backtest.optimizer.maxSharpe' },
  { value: 'maxSortino', labelKey: 'backtest.optimizer.maxSortino' },
];
const CONSTRAINT_DEFS: Array<{
  enabledKey: 'enableMaxDD' | 'enableMinCagr';
  valueKey: 'maxDD' | 'minCagr';
  labelKey: string;
  placeholderKey: string;
}> = [
  {
    enabledKey: 'enableMaxDD',
    valueKey: 'maxDD',
    labelKey: 'backtest.optimizer.maxDrawdownConstraint',
    placeholderKey: 'backtest.optimizer.maxDrawdownPlaceholder',
  },
  {
    enabledKey: 'enableMinCagr',
    valueKey: 'minCagr',
    labelKey: 'backtest.optimizer.cagrConstraint',
    placeholderKey: 'backtest.optimizer.cagrPlaceholder',
  },
];
const RANGE_DEFS: Array<{
  titleKey: string;
  prefix?: string;
  suffix?: string;
  step: string;
  fields: Array<[string, keyof OptimizerFormState]>;
}> = [
  {
    titleKey: 'backtest.optimizer.thresholdRange',
    suffix: '%',
    step: '0.5',
    fields: [
      ['Min', 'thrMin'],
      ['Max', 'thrMax'],
      ['backtest.optimizer.step', 'thrStep'],
    ],
  },
  {
    titleKey: 'backtest.optimizer.capitalRange',
    prefix: '$',
    step: '1000',
    fields: [
      ['Min', 'capMin'],
      ['Max', 'capMax'],
      ['backtest.optimizer.step', 'capStep'],
    ],
  },
];
const DATE_FIELDS: Array<{
  key: keyof OptimizerFormState;
  labelKey: string;
  type: string;
  placeholderKey?: string;
}> = [
  { key: 'startDate', labelKey: 'Start Date', type: 'date' },
  { key: 'endDate', labelKey: 'End Date', type: 'date' },
  {
    key: 'benchmarkTicker',
    labelKey: 'backtest.optimizer.benchmarkTicker',
    type: 'text',
    placeholderKey: 'backtest.optimizer.benchmarkPlaceholder',
  },
];

export function OptimizerParams({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <ParamGroup
        title={t('Portfolio Allocation')}
        info={t('Add tickers and weights for optimization')}
      >
        <SinglePortfolioEditor
          singleMode
          assets={s.assets.map(({ ticker, weight }) => ({ ticker, weight: Number(weight) || 0 }))}
          totalWeight={s.assets.reduce((sum, a) => sum + (Number(a.weight) || 0), 0)}
          onAdd={s.addAsset}
          onRemove={s.removeAsset}
          onUpdate={(i, field, val) => s.updateAsset(i, field, String(val))}
          wrapInSection={false}
        />
      </ParamGroup>
      <ParameterSpaceSection s={s} />
      <ParamGroup title={t('Objective')} info={t('Select optimization objective and constraints')}>
        <ParamRow>
          <ParamCard label={t('Target')}>
            <Select
              value={s.form.objective}
              onValueChange={(v) => s.patchForm({ objective: v as Objective })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamCard>
        </ParamRow>
        <div className="mt-3 flex flex-col gap-3">
          {CONSTRAINT_DEFS.map((c) => (
            <div key={c.enabledKey} className="flex items-center gap-2.5">
              <label className="flex items-center gap-2 w-[130px] mb-0 cursor-pointer">
                <Switch
                  checked={s.form[c.enabledKey]}
                  onCheckedChange={(v) => s.patchForm({ [c.enabledKey]: v })}
                />
                <span className="text-caption text-fg-secondary">{t(c.labelKey)}</span>
              </label>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    className="font-mono tabular-nums"
                    value={s.form[c.valueKey]}
                    onChange={(e) => s.patchForm({ [c.valueKey]: e.target.value })}
                    placeholder={t(c.placeholderKey)}
                    disabled={!s.form[c.enabledKey]}
                  />
                  <span className="text-caption text-fg-tertiary shrink-0">%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ParamGroup>
      <ParamGroup
        title={t('Backtest Range')}
        info={t('Set the backtest time range for parameter search')}
      >
        <ParamRow>
          {DATE_FIELDS.map((f) => (
            <ParamCard key={f.key} label={t(f.labelKey)}>
              <Input
                type={f.type}
                value={s.form[f.key] as string}
                onChange={(e) => s.patchForm({ [f.key]: e.target.value })}
                placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
              />
            </ParamCard>
          ))}
        </ParamRow>
      </ParamGroup>
      <div className="py-3">
        <RunButton
          isLoading={s.result.isLoading}
          onClick={() => void s.runOptimize()}
          label={t('Start Optimization')}
          loadingLabel={t('Optimizing...')}
        />
      </div>
    </ParamsPanel>
  );
}

export function OptimizerResults({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  const chartData = s.result.best ? buildChartData(s.result.best, s.result.benchmarkGrowth) : [];
  const nameMap: Record<string, string> = {
    portfolio: t('Optimal Portfolio'),
    benchmark: t('Benchmark'),
  };
  return (
    <ResultsShell
      error={s.result.error}
      errorPrefix={t('Optimization failed: ')}
      isLoading={s.result.isLoading}
      hasResults={!!s.result.results}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t('Configure parameters above and click "Start Optimization" to see results')}
    >
      <div className="flex flex-col gap-4">
        {s.result.best && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-body font-semibold text-fg">{t('Optimal Portfolio')}</div>
              <span className="text-caption text-fg-tertiary">
                {t('Total Combinations', { count: s.result.totalCombos })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {buildBestMetrics(s.result.best).map((m) => (
                <StatCard key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          </div>
        )}
        {chartData.length > 0 && (
          <>
            <div className="mb-3 mt-6 text-body font-semibold text-fg">
              {t('Growth Comparison')}
            </div>
            <SimpleChart
              type="line"
              data={chartData}
              height={320}
              margin={{ left: 8, right: 20, top: 5, bottom: 5 }}
              xTickFormatter={(d: number | string) => String(d).substring(0, 7)}
              yTickFormatter={(v: number) => fmtAmount(v)}
              tooltipFormatter={(v: number, name: string) => [fmtAmount(v), nameMap[name] ?? name]}
              tooltipLabelFormatter={(d: string) => d}
              showLegend
              legendFormatter={(name: string) => nameMap[name] ?? name}
              series={[
                {
                  dataKey: 'portfolio',
                  name: nameMap.portfolio,
                  color: getPortfolioColor(0),
                  width: 2,
                },
                {
                  dataKey: 'benchmark',
                  name: nameMap.benchmark,
                  color: getPortfolioColor(1),
                  width: 1.5,
                  dash: '4 2',
                },
              ]}
            />
          </>
        )}
        <div className="mb-3 mt-6 text-body font-semibold text-fg">
          {t('Portfolio Comparison Table')}
        </div>
        {(s.result.results ?? []).length > 0 ? (
          <SortableTable
            columns={TABLE_COLUMNS}
            data={s.result.results ?? []}
            initialSortKey={OBJECTIVE_SORT_KEY[s.form.objective]}
            initialSortDir="desc"
          />
        ) : (
          <TableEmpty message={t('No portfolio matches the constraints')} />
        )}
      </div>
    </ResultsShell>
  );
}

function ParameterSpaceSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  const currency = useSettingsStore((s) => s.currency);
  return (
    <ParamGroup
      title={t('Parameter Space')}
      info={t('Set the search range for rebalance frequency and thresholds')}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="mb-1.5 text-caption font-medium text-fg-secondary">
            {t('Rebalancing Frequency')}
          </div>
          <div className="flex flex-wrap gap-2">
            {REBALANCE_FREQUENCY_OPTIONS.map((o) => (
              <Button
                key={o.value}
                variant={s.frequencies.includes(o.value) ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => s.toggleFreq(o.value)}
              >
                {t(o.label)}
              </Button>
            ))}
          </div>
        </div>
        {RANGE_DEFS.map((r) => (
          <div key={r.titleKey}>
            <div className="mb-1.5 text-caption font-medium text-fg-secondary">{t(r.titleKey)}</div>
            <ParamRow>
              {r.fields.map(([labelKey, formKey]) => (
                <ParamCard key={labelKey} label={t(labelKey)}>
                  <div className="flex items-center gap-2">
                    {r.prefix && (
                      <span className="text-body text-fg-tertiary font-mono shrink-0">
                        {r.prefix === '$' ? (currency === 'cny' ? '¥' : '$') : r.prefix}
                      </span>
                    )}
                    <Input
                      type="number"
                      step={r.step}
                      className="font-mono tabular-nums"
                      value={s.form[formKey] as string}
                      onChange={(e) => s.patchForm({ [formKey]: e.target.value })}
                    />
                    {r.suffix && (
                      <span className="text-caption text-fg-tertiary shrink-0">{r.suffix}</span>
                    )}
                  </div>
                </ParamCard>
              ))}
            </ParamRow>
          </div>
        ))}
      </div>
    </ParamGroup>
  );
}

const config: ComputeToolConfig<BacktestOptimizerState> = {
  titleKey: 'backtest.optimizer.pageTitle',
  seoDescKey: 'optimizer.seoDesc',
  seoFeatures: [
    {
      titleKey: 'backtest.optimizer.featureParamSpaceTitle',
      descKey: 'backtest.optimizer.featureParamSpaceDesc',
    },
    {
      titleKey: 'backtest.optimizer.featureMultiObjectiveTitle',
      descKey: 'backtest.optimizer.featureMultiObjectiveDesc',
    },
  ],
  params: ({ state }) => <OptimizerParams s={state} />,
  results: ({ state }) => <OptimizerResults s={state} />,
};
export default function BacktestOptimizerPage() {
  const s = useOptimizerState();
  return <ComputeToolShell config={config} state={s} />;
}
