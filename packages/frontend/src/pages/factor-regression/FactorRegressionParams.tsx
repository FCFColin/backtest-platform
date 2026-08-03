import { useTranslation } from 'react-i18next';
import { Input, badgeVariants } from '@/components/ui/uiComponents';
import { AllHistoryCheckbox } from '@/components/params/toolFields.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '../../components/form/Field.js';
import { LabeledField, SelectField, RunButton } from '@/components/form/sharedFields';
import { FACTOR_OPTIONS, RF_SOURCE_OPTIONS } from './factorRegressionUtils.js';
import type { AssetItem, ReturnFrequency } from './factorRegressionUtils.js';

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

interface FactorRegressionParamsPanelProps {
  startDate: string;
  endDate: string;
  returnFrequency: ReturnFrequency;
  rfSource: string;
  selectedFactors: string[];
  assets: AssetItem[];
  totalWeight: number;
  isLoading: boolean;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onReturnFrequencyChange: (v: ReturnFrequency) => void;
  onRfSourceChange: (v: string) => void;
  onToggleFactor: (key: string) => void;
  onAddAsset: () => void;
  onRemoveAsset: (i: number) => void;
  onUpdateAsset: (i: number, field: 'ticker' | 'weight', val: string | number) => void;
  onRun: () => void;
}

export function FactorRegressionParamsPanel(props: FactorRegressionParamsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field className="col-span-full">
        <AllHistoryCheckbox
          startDate={props.startDate}
          endDate={props.endDate}
          onStartDateChange={props.onStartDateChange}
          onEndDateChange={props.onEndDateChange}
          label={t('factorRegression.allHistory')}
        />
      </Field>
      <LabeledField htmlFor="fr-start-date" label={t('factorRegression.startDate')}>
        <Input
          id="fr-start-date"
          type="date"
          value={props.startDate}
          onChange={(e) => props.onStartDateChange(e.target.value)}
        />
      </LabeledField>
      <LabeledField htmlFor="fr-end-date" label={t('factorRegression.endDate')}>
        <Input
          id="fr-end-date"
          type="date"
          value={props.endDate}
          onChange={(e) => props.onEndDateChange(e.target.value)}
        />
      </LabeledField>
      <SelectField
        id="fr-freq"
        label={t('factorRegression.returnFrequency')}
        value={props.returnFrequency}
        onChange={props.onReturnFrequencyChange}
        options={[
          { value: 'monthly', label: t('factorRegression.freqMonthly') },
          { value: 'daily', label: t('factorRegression.freqDaily') },
        ]}
      />
      <SelectField
        id="fr-rf"
        label={t('factorRegression.rfRate')}
        value={props.rfSource}
        onChange={props.onRfSourceChange}
        options={RF_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
      />
      <div className="col-span-full">
        <Field>
          <FieldLabel>{t('factorRegression.factorSelect')}</FieldLabel>
          <FactorSelector selectedFactors={props.selectedFactors} onToggle={props.onToggleFactor} />
        </Field>
      </div>
      <div className="col-span-full">
        <PortfolioEditor
          singleMode
          assets={props.assets}
          totalWeight={props.totalWeight}
          onAdd={props.onAddAsset}
          onRemove={props.onRemoveAsset}
          onUpdate={props.onUpdateAsset}
        />
      </div>
      <div className="col-span-full">
        <RunButton
          isLoading={props.isLoading}
          onClick={props.onRun}
          label={t('factorRegression.startAnalysis')}
          loadingLabel={t('factorRegression.analyzing')}
        />
      </div>
    </div>
  );
}
