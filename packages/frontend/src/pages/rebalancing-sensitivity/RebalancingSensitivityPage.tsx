/* eslint-disable react-refresh/only-export-components */
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { RebalanceFrequency } from '@backtest/shared';
import { createComputeToolPage } from '@/components/shells/index.js';
import {
  REBALANCE_OPTIONS,
  TABS,
  useRebalancingState,
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
function cellClassName(isBest: boolean) {
  return `border-b border-border-subtle px-3 py-2 text-right font-mono text-label font-medium ${isBest ? 'font-bold text-success' : 'text-fg'}`;
}
type NumKey = 'cagr' | 'stdev' | 'maxDrawdown' | 'sharpe' | 'sortino';
const TABLE_COLS: Array<[string, NumKey, (v: number) => string]> = [
  ['stats.cagr', 'cagr', fmtPct],
  ['Volatility', 'stdev', fmtPct],
  ['Max Drawdown', 'maxDrawdown', fmtPct],
  ['Sharpe', 'sharpe', (v) => v.toFixed(2)],
  ['Sortino', 'sortino', (v) => v.toFixed(2)],
];
function ResultsPanel({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  const scatterData = s.results.map((r) => ({
    volatility: r.stdev * 100,
    cagr: r.cagr * 100,
    label: r.label,
    color: r.color,
    sharpe: r.sharpe,
    maxDrawdown: r.maxDrawdown * 100,
    sortino: r.sortino,
  }));
  const distData = s.results.map((r) => ({
    name: t(`rebalancingSensitivity.freq.${r.frequency}`),
    CAGR: Number((r.cagr * 100).toFixed(2)),
    fill: r.color,
  }));
  const offsetData = s.offsetResults.map((r) => ({
    offset: `+${r.offset}d`,
    cagr: Number((r.cagr * 100).toFixed(2)),
  }));
  const offsetGrowthData = s.results.find((r) => r.frequency === s.offsetFreq)?.growthCurve ?? [];
  const best = {
    cagr: Math.max(...s.results.map((x) => x.cagr)),
    stdev: Math.min(...s.results.map((x) => x.stdev)),
    maxDrawdown: Math.min(...s.results.map((x) => x.maxDrawdown)),
    sharpe: Math.max(...s.results.map((x) => x.sharpe)),
    sortino: Math.max(...s.results.map((x) => x.sortino)),
  };
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
              series={scatterData.map((p) => ({ data: [p], color: p.color, zDataKey: 'sharpe' }))}
            />
          </TabsContent>
          <TabsContent value="distributions">
            <BarChartContent
              data={distData}
              seriesNames={['CAGR']}
              xDataKey="name"
              height={400}
              yTickFormatter={(v) => `${v}%`}
              showLegend={false}
            />
          </TabsContent>
          <TabsContent value="offset">
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
            <BarChartContent
              data={offsetData.map((d) => ({ offset: d.offset, CAGR: d.cagr }))}
              seriesNames={['CAGR']}
              xDataKey="offset"
              height={250}
              yTickFormatter={(v) => `${v}%`}
              showLegend={false}
            />
            {offsetGrowthData.length > 0 && (
              <SimpleLineChart
                data={offsetGrowthData.map((d) => ({ date: d.date, value: d.value }))}
                series={[{ dataKey: 'value', color: getPortfolioColor(0) }]}
                xDataKey="date"
                height={250}
                xTickFormatter={(v) => String(v).slice(0, 7)}
                yTickFormatter={(v) => v.toLocaleString()}
                showLegend={false}
              />
            )}
          </TabsContent>
          <TabsContent value="table">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-input-bg">
                    <th className="border-b-2 border-border-subtle px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
                      {t('Frequency')}
                    </th>
                    {TABLE_COLS.map(([label]) => (
                      <th
                        key={label}
                        className="border-b-2 border-border-subtle px-3 py-2.5 text-right text-caption font-semibold text-fg-tertiary"
                      >
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.results.map((r, idx) => (
                    <tr key={r.frequency} className={idx % 2 === 1 ? 'bg-input-bg' : ''}>
                      <td className="border-b border-border-subtle px-3 py-2 text-label text-fg">
                        <PortfolioLabel color={r.color} name={r.label} />
                      </td>
                      {TABLE_COLS.map(([, key, fmt]) => {
                        const val = r[key] as number;
                        return (
                          <td key={key} className={cellClassName(val === best[key])}>
                            {fmt(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </ResultsShell>
  );
}
function RebalancingSensitivityParamsForm({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  const bandField = (
    label: string,
    value: number | '',
    onChange: (v: number | '') => void,
    max: number,
  ) => (
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bandField(t('Absolute Deviation Band'), s.absoluteBand, s.setAbsoluteBand, 50)}
        {bandField(t('Relative Deviation Band'), s.relativeBand, s.setRelativeBand, 100)}
      </div>
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
