/**
 * @file 回测参数表单
 * @description 回测核心参数配置面板容器。同构 Card 采用 config+map 渲染，减少重复样板；
 *              DateCards 内部采用 config+map 渲染 2 个同构日期字段。
 *              基于 shadcn Input / Select / Switch + token 类名。
 */
import { memo, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { BacktestParameters } from '@backtest/shared';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TickerInput from './TickerInput.js';
import { validateDateChange } from './backtestParamsUtils.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { CashflowLegsSection, OneTimeCashflowSection } from './BacktestParamsForm.CashflowLegs.js';
import { ParamRow, ParamCard } from './params/index.js';

/** 复用 store 三件套（t + parameters + updateParameter），消除每张 Card 的重复调用 */
function useParamField() {
  const { t } = useTranslation();
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);
  return { t, parameters, updateParameter };
}

// ============ 同构参数卡片：config + map ============

/** 同构参数卡片配置（discriminated union 按 input 类型区分） */
type ParamCardConfig =
  | {
      kind: 'number';
      paramKey: 'startingValue' | 'rollingWindowMonths';
      labelKey: string;
      min: number;
      max?: number;
      step: number;
      fallback: number;
      prefixResolver?: (p: BacktestParameters) => string;
      suffixKey?: string;
    }
  | {
      kind: 'select';
      paramKey: 'baseCurrency';
      labelKey: string;
      options: { value: 'usd' | 'cny'; label: string }[];
    }
  | {
      kind: 'checkbox';
      paramKey: 'adjustForInflation' | 'extendedWithdrawalStats';
      labelKey: string;
      checkLabelKey: string;
    };

/** Row1 同构卡片（紧跟 DateRangeCard + DateCards 之后） */
const ROW1_CARDS: ParamCardConfig[] = [
  {
    kind: 'number',
    paramKey: 'startingValue',
    labelKey: 'params.startingValue',
    min: 1,
    step: 1000,
    fallback: 0,
    prefixResolver: (p) => (p.baseCurrency === 'usd' ? '$' : '¥'),
  },
  {
    kind: 'checkbox',
    paramKey: 'adjustForInflation',
    labelKey: 'params.inflationAdjust',
    checkLabelKey: 'params.adjustForInflation',
  },
  {
    kind: 'number',
    paramKey: 'rollingWindowMonths',
    labelKey: 'params.rollingWindow',
    min: 1,
    max: 120,
    step: 1,
    fallback: 12,
    suffixKey: 'params.months',
  },
];

/** Row2 同构卡片：ExtendedStats（BenchmarkCard 之前）与 Currency（BenchmarkCard 之后） */
const ROW2_LEAD: ParamCardConfig = {
  kind: 'checkbox',
  paramKey: 'extendedWithdrawalStats',
  labelKey: 'params.extendedStats',
  checkLabelKey: 'params.extendedWithdrawalStats',
};
const ROW2_TAIL: ParamCardConfig = {
  kind: 'select',
  paramKey: 'baseCurrency',
  labelKey: 'params.currency',
  options: [
    { value: 'usd', label: 'USD ($)' },
    { value: 'cny', label: 'CNY (¥)' },
  ],
};

/** 根据 config 渲染单个同构参数卡片，统一 useParamField 调用与 ParamCard 包裹 */
function BoundParamCard({ config }: { config: ParamCardConfig }) {
  const { t, parameters, updateParameter } = useParamField();
  const label = t(config.labelKey);

  if (config.kind === 'checkbox') {
    return (
      <ParamCard label={label}>
        <div className="flex items-center gap-2 h-10">
          <Switch
            id={`param-${config.paramKey}`}
            checked={parameters[config.paramKey]}
            onCheckedChange={(v) => updateParameter(config.paramKey, v)}
          />
          <label htmlFor={`param-${config.paramKey}`} className="text-caption text-fg-secondary cursor-pointer">
            {t(config.checkLabelKey)}
          </label>
        </div>
      </ParamCard>
    );
  }

  if (config.kind === 'select') {
    return (
      <ParamCard label={label}>
        <Select
          value={parameters[config.paramKey]}
          onValueChange={(v) => updateParameter(config.paramKey, v as 'usd' | 'cny')}
        >
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {config.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ParamCard>
    );
  }

  // number
  const prefix = config.prefixResolver?.(parameters);
  const handleNum = (e: ChangeEvent<HTMLInputElement>) =>
    updateParameter(
      config.paramKey,
      Math.max(config.min, Number(e.target.value) || config.fallback),
    );
  return (
    <ParamCard label={label}>
      {prefix !== undefined ? (
        <div className="flex items-center gap-2">
          <span className="text-body text-fg-tertiary font-mono">{prefix}</span>
          <Input
            type="number"
            value={parameters[config.paramKey]}
            min={config.min}
            step={config.step}
            onChange={handleNum}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={parameters[config.paramKey]}
            min={config.min}
            max={config.max}
            step={config.step}
            onChange={handleNum}
          />
          {config.suffixKey && (
            <span className="text-caption text-fg-tertiary shrink-0">{t(config.suffixKey)}</span>
          )}
        </div>
      )}
    </ParamCard>
  );
}

function DateRangeCard({ mode, onChange }: { mode: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <ParamCard label={t('params.dateRange')}>
      <Select value={mode} onValueChange={onChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('params.allHistory')}</SelectItem>
          <SelectItem value="custom">{t('params.customRange')}</SelectItem>
        </SelectContent>
      </Select>
    </ParamCard>
  );
}

/** 日期输入卡片组：2 个同构 date 字段采用 config+map 渲染，共享 toast 校验逻辑 */
function DateCards({ mode }: { mode: string }) {
  const { t, parameters, updateParameter } = useParamField();
  const dateFields = [
    {
      paramKey: 'startDate' as const,
      compareKey: 'endDate' as const,
      labelKey: 'params.startDate',
    },
    { paramKey: 'endDate' as const, compareKey: 'startDate' as const, labelKey: 'params.endDate' },
  ];
  return (
    <>
      {dateFields.map(({ paramKey, compareKey, labelKey }) => (
        <ParamCard key={paramKey} label={t(labelKey)}>
          <Input
            type="date"
            value={parameters[paramKey]}
            disabled={mode === 'all'}
            onChange={(e) => {
              const err = validateDateChange(paramKey, e.target.value, parameters[compareKey], t);
              if (err) {
                useToastStore.getState().addToast('warning', err);
                return;
              }
              updateParameter(paramKey, e.target.value);
            }}
          />
        </ParamCard>
      ))}
    </>
  );
}

function BenchmarkCard() {
  const { t, parameters, updateParameter } = useParamField();
  return (
    <ParamCard label={t('params.benchmark')}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 h-10">
          <Switch
            id="param-benchmark"
            checked={parameters.benchmarkTicker !== ''}
            onCheckedChange={(v) => updateParameter('benchmarkTicker', v ? 'SPY' : '')}
          />
          <label htmlFor="param-benchmark" className="text-caption text-fg-secondary cursor-pointer">
            {t('params.pickBenchmarkTicker')}
          </label>
        </div>
        {parameters.benchmarkTicker !== '' && (
          <TickerInput
            value={parameters.benchmarkTicker}
            onChange={(v) => updateParameter('benchmarkTicker', v)}
            placeholder="SPY"
          />
        )}
      </div>
    </ParamCard>
  );
}

function BasicParamsSection() {
  const parameters = useBacktestStore(useShallow((s) => s.parameters));
  const updateParameter = useBacktestStore((s) => s.updateParameter);

  const dateRangeMode = parameters.startDate === '' && parameters.endDate === '' ? 'all' : 'custom';

  const handleDateRangeChange = (value: string) => {
    if (value === 'all') {
      updateParameter('startDate', '');
      updateParameter('endDate', '');
    } else {
      updateParameter('startDate', DEFAULT_BACKTEST_START_DATE);
      updateParameter('endDate', DEFAULT_END_DATE);
    }
  };

  return (
    <>
      <ParamRow>
        <DateRangeCard mode={dateRangeMode} onChange={handleDateRangeChange} />
        <DateCards mode={dateRangeMode} />
        {ROW1_CARDS.map((config) => (
          <BoundParamCard key={config.paramKey} config={config} />
        ))}
      </ParamRow>
      <ParamRow>
        <BoundParamCard config={ROW2_LEAD} />
        <BenchmarkCard />
        <BoundParamCard config={ROW2_TAIL} />
      </ParamRow>
    </>
  );
}

const BacktestParamsForm = memo(function BacktestParamsForm() {
  return (
    <>
      <BasicParamsSection />
      <CashflowLegsSection />
      <OneTimeCashflowSection />
    </>
  );
});

export default BacktestParamsForm;
