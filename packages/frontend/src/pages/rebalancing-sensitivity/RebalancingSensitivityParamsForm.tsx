/**
 * @file 调仓敏感性分析参数表单
 * @description 基础参数 + 调仓频率多选 + 偏离带 + 投资组合编辑 + 执行按钮。
 *   使用 shadcn Field/Input/Button + token 化样式，testfol.io 风格。
 */
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { REBALANCE_OPTIONS, type RebalancingState } from './rebalancingSensitivityUtils.js';
import { BasicParamsRow } from '../../components/ParamsShared.js';
import PortfolioEditor from '../../components/PortfolioEditor.js';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/input';

/** FreqSelector: 调仓频率多选 chip 组，选中态沿用各频率主题色。 */
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

/** RebalBandFields: 绝对/相对偏离带两个数值输入（带 % 后缀，留空关闭）。 */
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
            onChange={(e) =>
              s.setAbsoluteBand(e.target.value === '' ? '' : Number(e.target.value))
            }
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
            onChange={(e) =>
              s.setRelativeBand(e.target.value === '' ? '' : Number(e.target.value))
            }
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

/**
 * RebalancingSensitivityParamsForm: 调仓敏感性分析参数表单。
 * @param s - 页面状态。
 * @returns 参数表单元素。
 */
export function RebalancingSensitivityParamsForm({ s }: { s: RebalancingState }) {
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
