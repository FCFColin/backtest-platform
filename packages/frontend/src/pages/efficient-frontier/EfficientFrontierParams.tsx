/**
 * @file 有效前沿参数面板
 * @description 用 Field + Input/Select/Checkbox + Button 就地重构（testfol.io 风格）。
 *   外层 Card 由 ToolPageLayout 提供，本组件只负责分节内容：股票代码 / 参数设置（日期范围 + 高级参数）。
 *   底部为主操作按钮（计算有效前沿）。
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/form/Field';
import { TickerTagInput } from '../../components/form/TickerTagInput.js';
import type { SolveSpeed, FrontierSolver, ReturnObjective } from './efficientFrontierTypes.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

const solveSpeedOptions = (t: TFunction): { value: SolveSpeed; label: string }[] => [
  { value: 'ultrafast', label: t('efficientFrontier.solveSpeed.ultrafast') },
  { value: 'fast', label: t('efficientFrontier.solveSpeed.fast') },
  { value: 'medium', label: t('efficientFrontier.solveSpeed.medium') },
  { value: 'slow', label: t('efficientFrontier.solveSpeed.slow') },
];
const rebalanceFreqOptions = (t: TFunction): { value: string; label: string }[] => [
  { value: 'daily', label: t('efficientFrontier.rebalanceFreq.daily') },
  { value: 'weekly', label: t('efficientFrontier.rebalanceFreq.weekly') },
  { value: 'monthly', label: t('efficientFrontier.rebalanceFreq.monthly') },
  { value: 'quarterly', label: t('efficientFrontier.rebalanceFreq.quarterly') },
  { value: 'yearly', label: t('efficientFrontier.rebalanceFreq.yearly') },
];
const returnObjOptions = (t: TFunction): { value: ReturnObjective; label: string }[] => [
  { value: 'maxCagr', label: t('efficientFrontier.returnObjective.maxCagr') },
  { value: 'minVolatility', label: t('efficientFrontier.returnObjective.minVolatility') },
];
const solverOptions = (t: TFunction): { value: FrontierSolver; label: string }[] => [
  { value: 'markowitz', label: t('efficientFrontier.solver.markowitz') },
  { value: 'nsga2', label: t('efficientFrontier.solver.nsga2') },
];

interface FrontierParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numPoints: number;
  solveSpeed: SolveSpeed;
  minInclusionWeight: number;
  rebalanceFrequency: string;
  allowCash: boolean;
  returnObjective: ReturnObjective;
  solver: FrontierSolver;
  onAddTicker: () => void;
  onRemoveTicker: (i: number) => void;
  onUpdateTicker: (i: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumPointsChange: (v: number) => void;
  onSolveSpeedChange: (v: SolveSpeed) => void;
  onMinInclusionWeightChange: (v: number) => void;
  onRebalanceFrequencyChange: (v: string) => void;
  onAllowCashChange: (v: boolean) => void;
  onReturnObjectiveChange: (v: ReturnObjective) => void;
  onSolverChange: (v: FrontierSolver) => void;
  isLoading: boolean;
  onRun: () => void;
}

/** 区块标题（标题 + 可选说明） */
function SectionHeader({ title, info }: { title: string; info?: string }) {
  return (
    <div>
      <h3 className="text-h3 font-semibold text-fg">{title}</h3>
      {info && <p className="mt-0.5 text-caption text-fg-tertiary">{info}</p>}
    </div>
  );
}

/** 通用 Select 字段（Field + FieldLabel + shadcn Select） */
function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** 股票代码区：TickerTagInput + 增删改派发 */
function TickerListSection({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  const handleTagChange = (newTickers: string[]) => {
    const oldLen = p.tickers.length;
    if (newTickers.length > oldLen) {
      p.onAddTicker();
    } else if (newTickers.length < oldLen) {
      for (let i = 0; i < oldLen; i++) {
        if (!newTickers.includes(p.tickers[i])) {
          p.onRemoveTicker(i);
          break;
        }
      }
    } else {
      newTickers.forEach((tk, i) => {
        if (tk !== p.tickers[i]) p.onUpdateTicker(i, tk);
      });
    }
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={t('efficientFrontier.params.tickerList')} />
      <TickerTagInput
        tickers={p.tickers.filter(Boolean)}
        onChange={handleTagChange}
        minCount={2}
        placeholder={t('efficientFrontier.params.tickerPlaceholder')}
      />
    </section>
  );
}

/** 日期范围 + 采样点数 + 全历史开关字段组 */
function DateAndPointsGrid({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  const allHistoryChecked = p.startDate === '' && p.endDate === '';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field>
        <FieldLabel>{t('efficientFrontier.params.startDate')}</FieldLabel>
        <Input
          type="date"
          value={p.startDate}
          onChange={(e) => p.onStartDateChange(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>{t('efficientFrontier.params.endDate')}</FieldLabel>
        <Input type="date" value={p.endDate} onChange={(e) => p.onEndDateChange(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel>{t('efficientFrontier.params.numPoints')}</FieldLabel>
        <Input
          type="number"
          min={5}
          max={100}
          value={p.numPoints}
          onChange={(e) => p.onNumPointsChange(Number(e.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel>{t('efficientFrontier.params.allHistory')}</FieldLabel>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
          <Checkbox
            checked={allHistoryChecked}
            onCheckedChange={(c) => {
              if (c === true) {
                p.onStartDateChange('');
                p.onEndDateChange('');
              } else {
                p.onStartDateChange(DEFAULT_BACKTEST_START_DATE);
                p.onEndDateChange(DEFAULT_END_DATE);
              }
            }}
          />
          <span>{t('efficientFrontier.params.allHistory')}</span>
        </label>
      </Field>
    </div>
  );
}

/** 高级参数字段组：求解速度 / 最小纳入权重 / 再平衡 / 收益目标 / 求解器 / 允许现金 */
function AdvancedParamsGrid({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SelectField
        label={t('efficientFrontier.params.solveSpeed')}
        value={p.solveSpeed}
        onChange={p.onSolveSpeedChange}
        options={solveSpeedOptions(t)}
      />
      <Field>
        <FieldLabel>{t('efficientFrontier.params.minInclusionWeight')}</FieldLabel>
        <div className="relative">
          <Input
            type="number"
            min={0}
            max={100}
            className="pr-9"
            value={p.minInclusionWeight}
            onChange={(e) => p.onMinInclusionWeightChange(Number(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-fg-tertiary">
            %
          </span>
        </div>
      </Field>
      <SelectField
        label={t('efficientFrontier.params.rebalanceFreq')}
        value={p.rebalanceFrequency}
        onChange={p.onRebalanceFrequencyChange}
        options={rebalanceFreqOptions(t)}
      />
      <SelectField
        label={t('efficientFrontier.params.returnObjective')}
        value={p.returnObjective}
        onChange={p.onReturnObjectiveChange}
        options={returnObjOptions(t)}
      />
      <SelectField
        label={t('efficientFrontier.params.solver')}
        value={p.solver}
        onChange={p.onSolverChange}
        options={solverOptions(t)}
      />
      <Field>
        <FieldLabel>{t('efficientFrontier.params.allowCash')}</FieldLabel>
        <label className="flex h-10 cursor-pointer items-center gap-2 text-label text-fg-secondary">
          <Checkbox
            checked={p.allowCash}
            onCheckedChange={(c) => p.onAllowCashChange(c === true)}
          />
          <span>{t('efficientFrontier.params.allowCash')}</span>
        </label>
      </Field>
    </div>
  );
}

/** 参数设置区：日期范围 + 采样点数 + 高级参数（求解速度 / 最小纳入权重 / 再平衡 / 收益目标 / 求解器 / 允许现金） */
function ParamsSection({ p }: { p: FrontierParamsProps }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={t('efficientFrontier.params.title')} />
      <DateAndPointsGrid p={p} />
      <AdvancedParamsGrid p={p} />
    </section>
  );
}

function FrontierParams(props: FrontierParamsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <TickerListSection p={props} />
      <ParamsSection p={props} />
      <Button onClick={props.onRun} disabled={props.isLoading} variant="primary" className="w-full">
        {props.isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        {props.isLoading
          ? t('efficientFrontier.params.calculating')
          : t('efficientFrontier.params.calcFrontier')}
      </Button>
    </div>
  );
}

export { FrontierParams };
export type { FrontierSolver, ReturnObjective };
