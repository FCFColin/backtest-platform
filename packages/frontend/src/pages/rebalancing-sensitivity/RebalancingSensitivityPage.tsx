import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { ComputeToolShell, type ComputeToolConfig } from '@/components/shells/index.js';
import { REBALANCE_OPTIONS, useRebalancingState } from './rebalancingSensitivityUtils.js';
import type { RebalancingState } from './rebalancingSensitivityUtils.js';
import { ResultsPanel } from './ResultsPanel.js';
import { BasicParamsRow } from '../../components/BacktestParamsForm.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Button, Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
function FreqSelector({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <Field>
      <FieldLabel>{t('rebalancingSensitivity.params.freqMulti')}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {REBALANCE_OPTIONS.map((opt) => {
          const selected = s.selectedFreqs.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-caption font-semibold transition-colors"
              style={{
                borderColor: selected ? opt.color : 'hsl(var(--border))',
                backgroundColor: selected ? `${opt.color}18` : 'transparent',
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
function RebalBandFields({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field>
        <FieldLabel>{t('rebalancingSensitivity.params.absoluteBand')}</FieldLabel>
        <div className="relative">
          <Input
            type="number"
            value={s.absoluteBand}
            onChange={(e) => s.setAbsoluteBand(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={t('rebalancingSensitivity.params.bandPlaceholder')}
            min={0}
            max={50}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-fg-tertiary">
            %
          </span>
        </div>
      </Field>
      <Field>
        <FieldLabel>{t('rebalancingSensitivity.params.relativeBand')}</FieldLabel>
        <div className="relative">
          <Input
            type="number"
            value={s.relativeBand}
            onChange={(e) => s.setRelativeBand(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={t('rebalancingSensitivity.params.bandPlaceholder')}
            min={0}
            max={100}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-fg-tertiary">
            %
          </span>
        </div>
      </Field>
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
      <Button
        type="button"
        variant="primary"
        className="w-full"
        onClick={() => void s.runSensitivity()}
        disabled={s.isLoading}
      >
        {s.isLoading ? <Loader2 className="animate-spin" /> : <Play />}
        {s.isLoading
          ? t('rebalancingSensitivity.params.analyzing')
          : t('rebalancingSensitivity.params.startAnalysis')}
      </Button>
    </div>
  );
}
type RebalancingStateResult = ReturnType<typeof useRebalancingState>;
const config: ComputeToolConfig<RebalancingStateResult> = {
  titleKey: 'rebalancingSensitivity.title',
  seoDescKey: 'rebalancingSensitivity.seo.desc',
  seoFeatures: [
    {
      titleKey: 'rebalancingSensitivity.seo.analyzableTitle',
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
