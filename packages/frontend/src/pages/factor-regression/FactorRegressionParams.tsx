import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { LoadingButton } from '../../components/ui/uiComponents.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '../../components/form/Field.js';
import { Input } from '@/components/ui/uiComponents';
import { Checkbox } from '@/components/ui/uiComponents';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/uiComponents';
import { buttonVariants } from '@/components/ui/uiComponents';
import { badgeVariants } from '@/components/ui/uiComponents';
import { FACTOR_OPTIONS, RF_SOURCE_OPTIONS } from './factorRegressionUtils.js';
import type { AssetItem, ReturnFrequency } from './factorRegressionUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
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
              variant: active ? 'factor-active' : 'factor-inactive',
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
function FactorRegressionDateFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: Pick<
  FactorRegressionParamsPanelProps,
  'startDate' | 'endDate' | 'onStartDateChange' | 'onEndDateChange'
>) {
  const { t } = useTranslation();
  const allHistory = startDate === '' && endDate === '';
  return (
    <>
      <label className="col-span-full flex cursor-pointer items-center gap-2 text-label text-fg-secondary">
        <Checkbox
          checked={allHistory}
          onCheckedChange={(checked) => {
            if (checked) {
              onStartDateChange('');
              onEndDateChange('');
            } else {
              onStartDateChange(DEFAULT_BACKTEST_START_DATE);
              onEndDateChange(DEFAULT_END_DATE);
            }
          }}
        />
        {t('factorRegression.allHistory')}
      </label>
      <Field>
        <FieldLabel htmlFor="fr-start-date">{t('factorRegression.startDate')}</FieldLabel>
        <Input
          id="fr-start-date"
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="fr-end-date">{t('factorRegression.endDate')}</FieldLabel>
        <Input
          id="fr-end-date"
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
        />
      </Field>
    </>
  );
}
function FactorRegressionConfigFields({
  returnFrequency,
  rfSource,
  onReturnFrequencyChange,
  onRfSourceChange,
}: Pick<
  FactorRegressionParamsPanelProps,
  'returnFrequency' | 'rfSource' | 'onReturnFrequencyChange' | 'onRfSourceChange'
>) {
  const { t } = useTranslation();
  return (
    <>
      <Field>
        <FieldLabel htmlFor="fr-freq">{t('factorRegression.returnFrequency')}</FieldLabel>
        <Select
          value={returnFrequency}
          onValueChange={(v) => onReturnFrequencyChange(v as ReturnFrequency)}
        >
          <SelectTrigger id="fr-freq">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">{t('factorRegression.freqMonthly')}</SelectItem>
            <SelectItem value="daily">{t('factorRegression.freqDaily')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="fr-rf">{t('factorRegression.rfRate')}</FieldLabel>
        <Select value={rfSource} onValueChange={onRfSourceChange}>
          <SelectTrigger id="fr-rf">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RF_SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}
export function FactorRegressionParamsPanel(props: FactorRegressionParamsPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <FactorRegressionDateFields
        startDate={props.startDate}
        endDate={props.endDate}
        onStartDateChange={props.onStartDateChange}
        onEndDateChange={props.onEndDateChange}
      />
      <FactorRegressionConfigFields
        returnFrequency={props.returnFrequency}
        rfSource={props.rfSource}
        onReturnFrequencyChange={props.onReturnFrequencyChange}
        onRfSourceChange={props.onRfSourceChange}
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
        <LoadingButton
          isLoading={props.isLoading}
          onClick={props.onRun}
          loadingText={t('factorRegression.analyzing')}
          className={buttonVariants({ variant: 'primary', size: 'lg', className: 'w-full' })}
        >
          <Play className="w-4 h-4" />
          {t('factorRegression.startAnalysis')}
        </LoadingButton>
      </div>
    </div>
  );
}
