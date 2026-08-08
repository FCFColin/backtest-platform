import { useTranslation } from 'react-i18next';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import { REBALANCE_OPTIONS, useRebalancingState } from './rebalancingSensitivityUtils.js';
import type { RebalancingState } from './rebalancingSensitivityUtils.js';
import { ResultsPanel } from './ResultsPanel.js';
import { BasicParamsRow } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { RunButton } from '@/components/form/sharedFields';
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
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              {t(`rebalancingSensitivity.freq.${opt.value}`)}
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
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={t('Leave empty to disable')}
          min={0}
          max={max}
          className="pr-8"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-fg-tertiary">
          %
        </span>
      </div>
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
      <BasicParamsRow
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
type RebalancingStateResult = ReturnType<typeof useRebalancingState>;
const config: ComputeToolConfig<RebalancingStateResult> = {
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
  paramsTitleKey: 'rebalancingSensitivity.params.title',
  params: ({ state }) => <RebalancingSensitivityParamsForm s={state} />,
  results: ({ state }) => <ResultsPanel s={state} />,
};
export default function RebalancingSensitivityPage() {
  const s = useRebalancingState();
  return <ComputeToolShell config={config} state={s} />;
}
