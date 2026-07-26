/**
 * @file 参数空间 Section
 * @description 搜索参数空间配置：再平衡频率多选 + 阈值范围 + 资金范围。
 *   三个内部子组件（FreqMultiSelect / ThresholdRangeInputs / CapitalRangeInputs）
 *   仅在本文件内消费。基于 shadcn Input / Button + token 类名。
 */
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ParamsSection } from '../../../components/ParamsPanel.js';
import { ParamRow, ParamCard } from '../../../components/params/index.js';
import { FREQ_OPTIONS } from '../backtestOptimizerUtils.js';
import type { OptimizerSectionProps } from './types.js';

function FreqMultiSelect({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 text-caption font-medium text-fg-secondary">
        {t('backtest.optimizer.rebalanceFreq')}
      </div>
      <div className="flex flex-wrap gap-2">
        {FREQ_OPTIONS.map((opt) => {
          const active = s.frequencies.includes(opt.value);
          return (
            <Button
              key={opt.value}
              variant={active ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => s.toggleFreq(opt.value)}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function ThresholdRangeInputs({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 text-caption font-medium text-fg-secondary">
        {t('backtest.optimizer.thresholdRange')}
      </div>
      <ParamRow>
        {[
          [t('backtest.optimizer.min'), s.thrMin, s.setThrMin],
          [t('backtest.optimizer.max'), s.thrMax, s.setThrMax],
          [t('backtest.optimizer.step'), s.thrStep, s.setThrStep],
        ].map(([label, val, set]) => (
          <ParamCard key={label as string} label={label as string}>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                className="font-mono tabular-nums"
                value={val as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
              <span className="text-caption text-fg-tertiary shrink-0">%</span>
            </div>
          </ParamCard>
        ))}
      </ParamRow>
    </div>
  );
}

function CapitalRangeInputs({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  const fields: Array<[string, string, (v: string) => void]> = [
    [t('backtest.optimizer.min'), s.capMin, s.setCapMin],
    [t('backtest.optimizer.max'), s.capMax, s.setCapMax],
    [t('backtest.optimizer.step'), s.capStep, s.setCapStep],
  ];
  return (
    <div>
      <div className="mb-1.5 text-caption font-medium text-fg-secondary">
        {t('backtest.optimizer.capitalRange')}
      </div>
      <ParamRow>
        {fields.map(([label, val, set]) => (
          <ParamCard key={label} label={label}>
            <div className="flex items-center gap-2">
              <span className="text-body text-fg-tertiary font-mono shrink-0">$</span>
              <Input
                type="number"
                step="1000"
                className="font-mono tabular-nums"
                value={val}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          </ParamCard>
        ))}
      </ParamRow>
    </div>
  );
}

export function ParameterSpaceSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.paramSpace')}
      info={t('backtest.optimizer.paramSpaceInfo')}
    >
      <div className="flex flex-col gap-3">
        <FreqMultiSelect s={s} />
        <ThresholdRangeInputs s={s} />
        <CapitalRangeInputs s={s} />
      </div>
    </ParamsSection>
  );
}
