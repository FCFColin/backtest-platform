/**
 * @file 因子回归参数面板子组件
 * @description 承载日期/频率/无风险利率源/因子选择器与参数区，以及参数面板容器与执行按钮。
 *   基于 token + shadcn（Field / Input / Select / Checkbox / Badge）重构为 testfol.io 风格的网格参数区。
 */
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Field, FieldLabel } from '../../components/form/Field.js';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { buttonVariants } from '@/components/ui/button';
import { badgeVariants } from '@/components/ui/badge';
import { FACTOR_OPTIONS, RF_SOURCE_OPTIONS } from './factorRegressionUtils.js';
import type { AssetItem, ReturnFrequency } from './factorRegressionUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

/** 因子选择器：可点击 chip，激活态用 factor-active 配色 */
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

/** 因子回归参数面板 props */
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

/** 因子回归参数面板（参数区 + 资产编辑 + 执行按钮） */
export function FactorRegressionParamsPanel(props: FactorRegressionParamsPanelProps) {
  const { t } = useTranslation();
  const allHistory = props.startDate === '' && props.endDate === '';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="col-span-full flex cursor-pointer items-center gap-2 text-label text-fg-secondary">
        <Checkbox
          checked={allHistory}
          onCheckedChange={(checked) => {
            if (checked) {
              props.onStartDateChange('');
              props.onEndDateChange('');
            } else {
              props.onStartDateChange(DEFAULT_BACKTEST_START_DATE);
              props.onEndDateChange(DEFAULT_END_DATE);
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
          value={props.startDate}
          onChange={(e) => props.onStartDateChange(e.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="fr-end-date">{t('factorRegression.endDate')}</FieldLabel>
        <Input
          id="fr-end-date"
          type="date"
          value={props.endDate}
          onChange={(e) => props.onEndDateChange(e.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="fr-freq">{t('factorRegression.returnFrequency')}</FieldLabel>
        <Select
          value={props.returnFrequency}
          onValueChange={(v) => props.onReturnFrequencyChange(v as ReturnFrequency)}
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
        <Select value={props.rfSource} onValueChange={props.onRfSourceChange}>
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

      <div className="col-span-full">
        <Field>
          <FieldLabel>{t('factorRegression.factorSelect')}</FieldLabel>
          <FactorSelector
            selectedFactors={props.selectedFactors}
            onToggle={props.onToggleFactor}
          />
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
