/**
 * @file 优化目标 Section
 * @description 选择优化目标（maxCagr/minMaxDrawdown/maxSharpe/maxSortino）
 *   与可选约束（最大回撤上限 / CAGR 下限）。ConstraintRow 为内部子组件。
 *   基于 shadcn Input / Select / Switch + token 类名。
 */
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ParamsSection } from '../../../components/ParamsPanel.js';
import { ParamRow, ParamCard } from '../../../components/params/index.js';
import type { OptimizerSectionProps, ConstraintRowProps, Objective } from './types.js';

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

export function ObjectiveSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.objective')}
      info={t('backtest.optimizer.objectiveInfo')}
    >
      <ParamRow>
        <ParamCard label={t('backtest.optimizer.target')}>
          <Select value={s.objective} onValueChange={(v) => s.setObjective(v as Objective)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="maxCagr">{t('backtest.optimizer.maxCagr')}</SelectItem>
              <SelectItem value="minMaxDrawdown">
                {t('backtest.optimizer.minMaxDrawdown')}
              </SelectItem>
              <SelectItem value="maxSharpe">{t('backtest.optimizer.maxSharpe')}</SelectItem>
              <SelectItem value="maxSortino">{t('backtest.optimizer.maxSortino')}</SelectItem>
            </SelectContent>
          </Select>
        </ParamCard>
      </ParamRow>
      <div className="mt-3 flex flex-col gap-3">
        <ConstraintRow
          enabled={s.enableMaxDD}
          setEnabled={s.setEnableMaxDD}
          label={t('backtest.optimizer.maxDrawdownConstraint')}
          value={s.maxDD}
          setValue={s.setMaxDD}
          placeholder={t('backtest.optimizer.maxDrawdownPlaceholder')}
        />
        <ConstraintRow
          enabled={s.enableMinCagr}
          setEnabled={s.setEnableMinCagr}
          label={t('backtest.optimizer.cagrConstraint')}
          value={s.minCagr}
          setValue={s.setMinCagr}
          placeholder={t('backtest.optimizer.cagrPlaceholder')}
        />
      </div>
    </ParamsSection>
  );
}
