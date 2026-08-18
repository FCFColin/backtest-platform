/* eslint-disable react-refresh/only-export-components */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import type { RebalanceFrequency } from '@backtest/shared';
import { createComputeToolPage } from '@/components/shells/index.js';
import {
  REBALANCE_OPTIONS,
  TABS,
  useRebalancingState,
  type FreqResult,
  type RebalancingState,
} from './rebalancingSensitivityUtils.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import {
  Card,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  PortfolioLabel,
  AffixInput,
} from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { fmtPct } from '@/utils/format';
import {
  XYScatterChart,
  BarChartContent,
  SimpleLineChart,
} from '@/components/charts/sharedChartContent.js';
import { BasicParamsFields } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '@/components/form/Field';
import { RunButton } from '@/components/form/sharedFields';
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
      zRange={[60, 200]}
      xTickFormatter={(v: number) => `${v.toFixed(1)}%`}
      yTickFormatter={(v: number) => `${v.toFixed(1)}%`}
      tooltipFormatter={(v: number, name: string) =>
        name === 'sharpe' || name === 'sortino' ? v.toFixed(2) : `${v.toFixed(2)}%`
      }
      series={data.map((p) => ({ data: [p], color: p.color, zDataKey: 'sharpe' }))}
    />
  );
}
function DistributionTab({ results }: { results: FreqResult[] }) {
  const { t } = useTranslation();
  const data = results.map((r) => ({
    name: t(`rebalancingSensitivity.freq.${r.frequency}`),
    CAGR: Number((r.cagr * 100).toFixed(2)),
    fill: r.color,
  }));
  return (
    <BarChartContent
      data={data}
      seriesNames={['CAGR']}
      xDataKey="name"
      height={400}
      yTickFormatter={(v) => `${v}%`}
      showLegend={false}
    />
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
    <BarChartContent
      data={offsetData.map((d) => ({ offset: d.offset, CAGR: d.cagr }))}
      seriesNames={['CAGR']}
      xDataKey="offset"
      height={250}
      yTickFormatter={(v) => `${v}%`}
      showLegend={false}
    />
  );
}
function OffsetGrowthChart({ data }: { data: Array<{ date: string; value: number }> }) {
  return (
    <SimpleLineChart
      data={data.map((d) => ({ date: d.date, value: d.value }))}
      series={[{ dataKey: 'value', color: getPortfolioColor(0) }]}
      xDataKey="date"
      height={250}
      xTickFormatter={(v) => String(v).slice(0, 7)}
      yTickFormatter={(v) => v.toLocaleString()}
      showLegend={false}
    />
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
        <th className="border-b-2 border-border-subtle px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
          {t('Frequency')}
        </th>
        {cols.map(([label]) => (
          <th
            key={label}
            className="border-b-2 border-border-subtle px-3 py-2.5 text-right text-caption font-semibold text-fg-tertiary"
          >
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
function cellClassName(isBest: boolean) {
  return `border-b border-border-subtle px-3 py-2 text-right font-mono text-label font-medium ${isBest ? 'font-bold text-success' : 'text-fg'}`;
}
type NumKey = 'cagr' | 'stdev' | 'maxDrawdown' | 'sharpe' | 'sortino';
function ResultsTable({ results }: { results: FreqResult[] }) {
  const best = {
    cagr: Math.max(...results.map((x) => x.cagr)),
    stdev: Math.min(...results.map((x) => x.stdev)),
    mdd: Math.min(...results.map((x) => x.maxDrawdown)),
    sharpe: Math.max(...results.map((x) => x.sharpe)),
    sortino: Math.max(...results.map((x) => x.sortino)),
  };
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
              <td className="border-b border-border-subtle px-3 py-2 text-label text-fg">
                <PortfolioLabel color={r.color} name={r.label} />
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
function ResultsPanel({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <ResultsShell
      error={s.error}
      errorPrefix={`${t('Analysis failed')}: `}
      isLoading={s.isLoading}
      hasResults={s.results.length > 0}
      loadingLabel={t('Analyzing...')}
      emptyTitle={t('Select rebalancing frequencies and click "Run Analysis"')}
    >
      <Card className="p-5">
        <Tabs value={s.activeTab} onValueChange={s.setActiveTab}>
          <TabsList className="mb-4 flex-wrap">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="scatter">
            <ScatterTab results={s.results} />
          </TabsContent>
          <TabsContent value="distributions">
            <DistributionTab results={s.results} />
          </TabsContent>
          <TabsContent value="offset">
            <OffsetTab s={s} />
          </TabsContent>
          <TabsContent value="table">
            <ResultsTable results={s.results} />
          </TabsContent>
        </Tabs>
      </Card>
    </ResultsShell>
  );
}
function FreqSelector({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <Field>
      <FieldLabel>{t('Rebalancing Frequency (multi-select)')}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {REBALANCE_OPTIONS.map((opt) => {
          const selected = s.selectedFreqs.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-caption font-semibold transition-colors"
              style={{
                borderColor: selected ? opt.color : 'hsl(var(--border))',
                backgroundColor: selected
                  ? `color-mix(in srgb, ${opt.color} 10%, transparent)`
                  : 'transparent',
                color: selected ? opt.color : 'hsl(var(--fg-tertiary))',
              }}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected}
                onChange={() => s.toggleFreq(opt.value)}
              />
              <PortfolioLabel
                color={opt.color}
                name={t(`rebalancingSensitivity.freq.${opt.value}`)}
              />
            </label>
          );
        })}
      </div>
    </Field>
  );
}
function BandField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
  max: number;
}) {
  const { t } = useTranslation();
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <AffixInput
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder={t('Leave empty to disable')}
        min={0}
        max={max}
        suffix="%"
      />
    </Field>
  );
}
function RebalBandFields({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <BandField
        label={t('Absolute Deviation Band')}
        value={s.absoluteBand}
        onChange={s.setAbsoluteBand}
        max={50}
      />
      <BandField
        label={t('Relative Deviation Band')}
        value={s.relativeBand}
        onChange={s.setRelativeBand}
        max={100}
      />
    </div>
  );
}
function RebalancingSensitivityParamsForm({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <BasicParamsFields
        startDate={s.startDate}
        endDate={s.endDate}
        startingValue={s.startingValue}
        baseCurrency={s.baseCurrency}
        adjustForInflation={s.adjustForInflation}
        onChange={(field, value) => {
          if (field === 'startDate') s.setStartDate(value as string);
          else if (field === 'endDate') s.setEndDate(value as string);
          else if (field === 'startingValue') s.setStartingValue(value as number);
          else if (field === 'baseCurrency') s.setBaseCurrency(value as 'usd' | 'cny');
          else if (field === 'adjustForInflation') s.setAdjustForInflation(value as boolean);
        }}
      />
      <FreqSelector s={s} />
      <RebalBandFields s={s} />
      <PortfolioEditor
        singleMode
        assets={s.assets}
        totalWeight={s.totalWeight}
        onAdd={s.addAsset}
        onRemove={s.removeAsset}
        onUpdate={s.updateAsset}
      />
      <RunButton
        isLoading={s.isLoading}
        onClick={() => void s.runSensitivity()}
        label={t('Run Analysis')}
        loadingLabel={t('Analyzing...')}
        type="button"
      />
    </div>
  );
}
export default createComputeToolPage(useRebalancingState, {
  titleKey: 'nav.rebalancingSensitivity',
  seoDescKey: 'rebalancingSensitivity.seo.desc',
  seoFeatures: [
    {
      titleKey: 'analysis.seoAnalyzable',
      descKey: 'rebalancingSensitivity.seo.analyzableDesc',
    },
    {
      titleKey: 'rebalancingSensitivity.seo.offsetScanTitle',
      descKey: 'rebalancingSensitivity.seo.offsetScanDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.lumpsumVsDca', href: '/lumpsum-vs-dca' },
  ],
  params: ({ state }) => <RebalancingSensitivityParamsForm s={state} />,
  results: ({ state }) => <ResultsPanel s={state} />,
});
