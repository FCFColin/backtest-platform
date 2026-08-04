import { useTranslation } from 'react-i18next';
import { Input, badgeVariants } from '@/components/ui/uiComponents';
import { AllHistoryCheckbox } from '@/components/params/toolFields.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '../../components/form/Field.js';
import { LabeledField, SelectField, RunButton } from '@/components/form/sharedFields';
import { FACTOR_OPTIONS, RF_SOURCE_OPTIONS } from './factorRegressionUtils.js';
import type { FactorRegressionState } from '@/hooks/useFactorRegressionState.js';

function FactorSelector({
  selectedFactors,
  onToggle,
}: {
  selectedFactors: string[];
  onToggle: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {FACTOR_OPTIONS.map((opt) => {
        const active = selectedFactors.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onToggle(opt.key)}
            aria-pressed={active}
            className={badgeVariants({
              variant: active ? 'asset' : 'secondary',
              size: 'sm',
              className: 'cursor-pointer',
            })}
          >
            {t(opt.label)}
            <span className="font-normal opacity-70">({t(opt.desc)})</span>
          </button>
        );
      })}
    </div>
  );
}

export function FactorRegressionParamsPanel({ state: s }: { state: FactorRegressionState }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field className="col-span-full">
        <AllHistoryCheckbox
          startDate={s.startDate}
          endDate={s.endDate}
          onStartDateChange={s.setStartDate}
          onEndDateChange={s.setEndDate}
          label={t('All History')}
        />
      </Field>
      <LabeledField htmlFor="fr-start-date" label={t('Start Date')}>
        <Input
          id="fr-start-date"
          type="date"
          value={s.startDate}
          onChange={(e) => s.setStartDate(e.target.value)}
        />
      </LabeledField>
      <LabeledField htmlFor="fr-end-date" label={t('End Date')}>
        <Input
          id="fr-end-date"
          type="date"
          value={s.endDate}
          onChange={(e) => s.setEndDate(e.target.value)}
        />
      </LabeledField>
      <SelectField
        id="fr-freq"
        label={t('Return Frequency')}
        value={s.returnFrequency}
        onChange={s.setReturnFrequency}
        options={[
          { value: 'monthly', label: t('Monthly') },
          { value: 'daily', label: t('Daily') },
        ]}
      />
      <SelectField
        id="fr-rf"
        label={t('Risk-Free Rate')}
        value={s.rfSource}
        onChange={s.setRfSource}
        options={RF_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
      />
      <div className="col-span-full">
        <Field>
          <FieldLabel>{t('Factor Selection (Multi-select)')}</FieldLabel>
          <FactorSelector selectedFactors={s.selectedFactors} onToggle={s.toggleFactor} />
        </Field>
      </div>
      <div className="col-span-full">
        <PortfolioEditor
          singleMode
          assets={s.assets}
          totalWeight={s.totalWeight}
          onAdd={s.addAsset}
          onRemove={s.removeAsset}
          onUpdate={s.updateAsset}
        />
      </div>
      <div className="col-span-full">
        <RunButton
          isLoading={s.isLoading}
          onClick={s.runRegression}
          label={t('Start Analysis')}
          loadingLabel={t('Running regression...')}
        />
      </div>
    </div>
  );
}
