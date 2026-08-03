import { Play, Loader2, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import {
  ParamsPanel,
  ParamsSection,
  ParamRow,
  ParamCard,
} from '../../components/params/paramsLayout.js';
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui/uiComponents';
import { StatCard } from '@/components/cards.js';
import { SortableTable } from '../../components/tables.js';
import { CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from '@/lib/chart-theme.js';
import {
  FREQ_OPTIONS,
  OBJECTIVE_SORT_KEY,
  TABLE_COLUMNS,
  buildBestMetrics,
  buildChartData,
} from './backtestOptimizerUtils.js';
import type {
  BestMetricsCardProps,
  ComparisonTableSectionProps,
  ConstraintRowProps,
  GrowthComparisonChartProps,
  Objective,
  OptimizerFormState,
  OptimizerSectionProps,
} from './backtestOptimizerUtils.js';
const INPUT_CLS =
  'flex h-10 w-full rounded-md bg-input-bg border border-border px-3 py-2 text-body text-fg hover:border-border-strong focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 transition-colors duration-150';
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
      ['backtest.optimizer.min', 'thrMin'],
      ['backtest.optimizer.max', 'thrMax'],
      ['backtest.optimizer.step', 'thrStep'],
    ],
  },
  {
    titleKey: 'backtest.optimizer.capitalRange',
    prefix: '$',
    step: '1000',
    fields: [
      ['backtest.optimizer.min', 'capMin'],
      ['backtest.optimizer.max', 'capMax'],
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
  { key: 'startDate', labelKey: 'backtest.optimizer.startDate', type: 'date' },
  { key: 'endDate', labelKey: 'backtest.optimizer.endDate', type: 'date' },
  {
    key: 'benchmarkTicker',
    labelKey: 'backtest.optimizer.benchmarkTicker',
    type: 'text',
    placeholderKey: 'backtest.optimizer.benchmarkPlaceholder',
  },
];
function BacktestRangeSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.backtestRange')}
      info={t('backtest.optimizer.backtestRangeInfo')}
    >
      <ParamRow>
        {DATE_FIELDS.map((f) => (
          <ParamCard key={f.key} label={t(f.labelKey)}>
            <input
              type={f.type}
              className={f.placeholderKey ? `${INPUT_CLS} placeholder:text-fg-tertiary` : INPUT_CLS}
              value={s.form[f.key]}
              onChange={(e) => s.patchForm({ [f.key]: e.target.value })}
              placeholder={f.placeholderKey ? t(f.placeholderKey) : undefined}
            />
          </ParamCard>
        ))}
      </ParamRow>
    </ParamsSection>
  );
}
function BestMetricsCard({ best, totalCombos }: BestMetricsCardProps) {
  const { t } = useTranslation();
  if (!best) return null;
  const metrics = buildBestMetrics(best);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-body font-semibold text-fg">{t('backtest.optimizer.bestCombo')}</div>
        <span className="text-caption text-fg-tertiary">
          {t('backtest.optimizer.totalCombos', { count: totalCombos })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} />
        ))}
      </div>
    </div>
  );
}
export function OptimizerParams({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={s} />
      <ParameterSpaceSection s={s} />
      <ObjectiveSection s={s} />
      <BacktestRangeSection s={s} />
      <div className="py-3">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => void s.runOptimize()}
          disabled={s.result.isLoading}
        >
          {s.result.isLoading ? <Loader2 className="animate-spin" /> : <Play />}
          {s.result.isLoading
            ? t('backtest.optimizer.optimizing')
            : t('backtest.optimizer.startOptimize')}
        </Button>
      </div>
    </ParamsPanel>
  );
}
export function OptimizerResults({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  if (s.result.error) {
    return (
      <Card className="flex items-center justify-center p-6 text-center text-danger">
        {t('backtest.optimizer.optimizeFailed')}
        {s.result.error}
      </Card>
    );
  }
  if (!s.result.results) {
    return (
      <Card className="flex items-center justify-center p-12 text-center text-fg-tertiary">
        {t('backtest.optimizer.configHint')}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <BestMetricsCard best={s.result.best} totalCombos={s.result.totalCombos} />
      <GrowthComparisonChart best={s.result.best} benchmarkGrowth={s.result.benchmarkGrowth} />
      <ComparisonTableSection results={s.result.results} objective={s.form.objective} />
    </div>
  );
}
function PortfolioConfigSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.portfolioConfig')}
      info={t('backtest.optimizer.portfolioConfigInfo')}
    >
      <div className="flex flex-col gap-2">
        {s.assets.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              type="text"
              value={a.ticker}
              onChange={(e) => s.updateAsset(i, 'ticker', e.target.value)}
              placeholder={t('backtest.optimizer.tickerPlaceholder')}
              className="flex-1"
            />
            <div className="flex items-center gap-1 w-[110px]">
              <Input
                type="number"
                className="font-mono tabular-nums"
                value={a.weight}
                onChange={(e) => s.updateAsset(i, 'weight', e.target.value)}
                placeholder={t('backtest.optimizer.weightPlaceholder')}
                min={0}
                max={100}
              />
              <span className="text-caption text-fg-tertiary shrink-0">%</span>
            </div>
            {s.assets.length > 1 && (
              <Button
                variant="destructive"
                size="icon"
                onClick={() => s.removeAsset(i)}
                title={t('backtest.optimizer.delete')}
                aria-label={t('backtest.optimizer.delete')}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2">
        <Button variant="ghost" size="sm" onClick={s.addAsset}>
          <Plus />
          {t('backtest.optimizer.addTicker')}
        </Button>
      </div>
    </ParamsSection>
  );
}
function FreqMultiSelect({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 text-caption font-medium text-fg-secondary">
        {t('backtest.optimizer.rebalanceFreq')}
      </div>
      <div className="flex flex-wrap gap-2">
        {FREQ_OPTIONS.map((opt) => {
          const active = s.frequencies.includes(opt.value);
          return (
            <Button
              key={opt.value}
              variant={active ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => s.toggleFreq(opt.value)}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
function RangeInputs({
  titleKey,
  prefix,
  suffix,
  step,
  fields,
}: {
  titleKey: string;
  prefix?: string;
  suffix?: string;
  step: string;
  fields: Array<[string, string, (v: string) => void]>;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 text-caption font-medium text-fg-secondary">{t(titleKey)}</div>
      <ParamRow>
        {fields.map(([label, val, set]) => (
          <ParamCard key={label} label={label}>
            <div className="flex items-center gap-2">
              {prefix && (
                <span className="text-body text-fg-tertiary font-mono shrink-0">{prefix}</span>
              )}
              <Input
                type="number"
                step={step}
                className="font-mono tabular-nums"
                value={val}
                onChange={(e) => set(e.target.value)}
              />
              {suffix && <span className="text-caption text-fg-tertiary shrink-0">{suffix}</span>}
            </div>
          </ParamCard>
        ))}
      </ParamRow>
    </div>
  );
}
function ParameterSpaceSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.paramSpace')}
      info={t('backtest.optimizer.paramSpaceInfo')}
    >
      <div className="flex flex-col gap-3">
        <FreqMultiSelect s={s} />
        {RANGE_DEFS.map((r) => (
          <RangeInputs
            key={r.titleKey}
            titleKey={r.titleKey}
            prefix={r.prefix}
            suffix={r.suffix}
            step={r.step}
            fields={r.fields.map(
              ([labelKey, formKey]) =>
                [t(labelKey), s.form[formKey], (v: string) => s.patchForm({ [formKey]: v })] as [
                  string,
                  string,
                  (v: string) => void,
                ],
            )}
          />
        ))}
      </div>
    </ParamsSection>
  );
}
function ConstraintRow({
  enabled,
  setEnabled,
  label,
  value,
  setValue,
  placeholder,
}: ConstraintRowProps) {
  return (
    <div className="flex items-center gap-2.5">
      <label className="flex items-center gap-2 w-[130px] mb-0 cursor-pointer">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <span className="text-caption text-fg-secondary">{label}</span>
      </label>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="0.1"
            className="font-mono tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={!enabled}
          />
          <span className="text-caption text-fg-tertiary shrink-0">%</span>
        </div>
      </div>
    </div>
  );
}
function ObjectiveSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.objective')}
      info={t('backtest.optimizer.objectiveInfo')}
    >
      <ParamRow>
        <ParamCard label={t('backtest.optimizer.target')}>
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
          <ConstraintRow
            key={c.enabledKey}
            enabled={s.form[c.enabledKey]}
            setEnabled={(v) => s.patchForm({ [c.enabledKey]: v })}
            label={t(c.labelKey)}
            value={s.form[c.valueKey]}
            setValue={(v) => s.patchForm({ [c.valueKey]: v })}
            placeholder={t(c.placeholderKey)}
          />
        ))}
      </div>
    </ParamsSection>
  );
}
function GrowthComparisonChart({ best, benchmarkGrowth }: GrowthComparisonChartProps) {
  const { t } = useTranslation();
  const chartData = buildChartData(best, benchmarkGrowth);
  if (chartData.length === 0) return null;
  return (
    <>
      <div className="mb-3 mt-6 text-body font-semibold text-fg">
        {t('backtest.optimizer.growthComparison')}
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 8, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: 'hsl(var(--fg-tertiary))' }}
            tickFormatter={(d: string) => d.substring(0, 7)}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'hsl(var(--fg-tertiary))' }}
            tickFormatter={(v: number) => `$${v.toLocaleString('en-US')}`}
            width={70}
          />
          <Tooltip
            labelFormatter={(d: string) => d}
            formatter={(v: number, name: string) => [
              `$${v.toLocaleString('en-US')}`,
              name === 'portfolio'
                ? t('backtest.optimizer.bestPortfolio')
                : t('backtest.optimizer.benchmark'),
            ]}
            contentStyle={CHART_TOOLTIP_STYLE}
          />
          <Legend
            formatter={(name: string) =>
              name === 'portfolio'
                ? t('backtest.optimizer.bestPortfolio')
                : t('backtest.optimizer.benchmark')
            }
          />
          <Line
            type="monotone"
            dataKey="portfolio"
            stroke={CHART_COLORS[0]}
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="benchmark"
            stroke={CHART_COLORS[1]}
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
function ComparisonTableSection({ results, objective }: ComparisonTableSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-3 mt-6 text-body font-semibold text-fg">
        {t('backtest.optimizer.comparisonTable')}
      </div>
      {results.length > 0 ? (
        <SortableTable
          columns={TABLE_COLUMNS}
          data={results}
          initialSortKey={OBJECTIVE_SORT_KEY[objective]}
          initialSortDir="desc"
        />
      ) : (
        <div className="py-6 text-center text-body text-fg-tertiary">
          {t('backtest.optimizer.noConstraintMatch')}
        </div>
      )}
    </>
  );
}
