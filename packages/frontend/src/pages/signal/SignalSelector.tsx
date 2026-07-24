/**
 * @file 多信号参数面板（SignalSelector）
 * @description 信号列表 + 聚合配置 + 回测参数，导出为 MultiSignalParamsPanel 子组件。
 *   基于 shadcn Select / Input / RadioGroup + Field 包装，遵循 testfol.io 风格。
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import {
  INDICATORS,
  RunAnalysisButton,
  TickerField,
} from './SignalParamsPanel.js';
import type { AggregationMethod, SignalItem } from './multiSignalTypes.js';

/** 聚合方式选项（label 为 i18n key） */
const AGGREGATION_METHODS: { value: AggregationMethod; label: string }[] = [
  { value: 'weighted', label: 'signal.multi.aggregationWeighted' },
  { value: 'voting', label: 'signal.multi.aggregationVoting' },
  { value: 'rank', label: 'signal.multi.aggregationRank' },
];

/** 聚合方式说明文案 i18n key 映射 */
const AGGREGATION_DESC: Record<AggregationMethod, string> = {
  weighted: 'signal.multi.descWeighted',
  voting: 'signal.multi.descVoting',
  rank: 'signal.multi.descRank',
};

/** MultiSignalParamsPanel Props */
interface MultiSignalParamsProps {
  signals: SignalItem[];
  weights: number[];
  aggregationMethod: AggregationMethod;
  ticker: string;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  onAddSignal: () => void;
  onRemoveSignal: (id: number) => void;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onUpdateWeight: (idx: number, val: number) => void;
  onAggregationMethodChange: (m: AggregationMethod) => void;
  onTickerChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onRun: () => void;
}

/** 信号行字段尺寸常量（紧凑行内布局） */
const ROW_INPUT_CLS = 'h-9 w-16 font-mono tabular-nums';

/**
 * 单个信号配置行：指标 / 周期 / 阈值 / 权重（可选）/ 删除。
 * @param props - 信号数据与变更回调
 * @returns 渲染的信号行
 */
function SignalRow({
  signal: s,
  idx,
  weight,
  showWeight,
  canRemove,
  onUpdateSignal,
  onRemoveSignal,
  onUpdateWeight,
}: {
  signal: SignalItem;
  idx: number;
  weight: number;
  showWeight: boolean;
  canRemove: boolean;
  onUpdateSignal: (id: number, patch: Partial<SignalItem>) => void;
  onRemoveSignal: (id: number) => void;
  onUpdateWeight: (idx: number, val: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-input-bg/50 p-3 hover:bg-hover">
      <Select value={s.indicator} onValueChange={(v) => onUpdateSignal(s.id, { indicator: v })}>
        <SelectTrigger className="h-9 w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INDICATORS.map((ind) => (
            <SelectItem key={ind} value={ind}>
              {ind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        className={ROW_INPUT_CLS}
        value={s.period}
        min={2}
        title={t('signal.multi.period')}
        onChange={(e) => onUpdateSignal(s.id, { period: Number(e.target.value) })}
      />
      <Input
        type="number"
        className={ROW_INPUT_CLS}
        value={s.threshold}
        title={t('signal.multi.threshold')}
        onChange={(e) => onUpdateSignal(s.id, { threshold: Number(e.target.value) })}
      />
      {showWeight && (
        <Input
          type="number"
          step="0.1"
          className={`${ROW_INPUT_CLS} w-[72px]`}
          value={weight}
          title={t('signal.multi.weight')}
          onChange={(e) => onUpdateWeight(idx, Number(e.target.value))}
        />
      )}
      {canRemove && (
        <Button
          variant="destructive"
          size="icon"
          className="h-9 w-9"
          onClick={() => onRemoveSignal(s.id)}
          title={t('signal.multi.delete')}
          aria-label={t('signal.multi.delete')}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

/** 信号列表 section Props */
type SignalListSectionProps = Pick<
  MultiSignalParamsProps,
  | 'signals'
  | 'weights'
  | 'aggregationMethod'
  | 'onAddSignal'
  | 'onRemoveSignal'
  | 'onUpdateSignal'
  | 'onUpdateWeight'
>;

/**
 * 信号列表 section：标题 + 说明 + 信号行列表 + 添加按钮。
 * @param props - 见 SignalListSectionProps
 * @returns 渲染的信号列表 section
 */
function SignalListSection({
  signals,
  weights,
  aggregationMethod,
  onAddSignal,
  onRemoveSignal,
  onUpdateSignal,
  onUpdateWeight,
}: SignalListSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-h3 text-fg">{t('signal.multi.signalList')}</h3>
        <FieldDescription>{t('signal.multi.signalListInfo')}</FieldDescription>
      </div>
      <div className="flex flex-col gap-2">
        {signals.map((s, idx) => (
          <SignalRow
            key={s.id}
            signal={s}
            idx={idx}
            weight={weights[idx] ?? 0}
            showWeight={aggregationMethod === 'weighted'}
            canRemove={signals.length > 1}
            onUpdateSignal={onUpdateSignal}
            onRemoveSignal={onRemoveSignal}
            onUpdateWeight={onUpdateWeight}
          />
        ))}
      </div>
      <Button variant="secondary" size="sm" className="w-fit" onClick={onAddSignal}>
        <Plus className="size-4" />
        {t('signal.multi.addSignal')}
      </Button>
    </section>
  );
}

/** 聚合配置 section Props */
type AggregationSectionProps = Pick<
  MultiSignalParamsProps,
  'aggregationMethod' | 'onAggregationMethodChange'
>;

/**
 * 聚合配置 section：RadioGroup 选择聚合方式 + 说明文案。
 * @param props - 见 AggregationSectionProps
 * @returns 渲染的聚合配置 section
 */
function AggregationSection({
  aggregationMethod,
  onAggregationMethodChange,
}: AggregationSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h3 text-fg">{t('signal.multi.aggregationSection')}</h3>
      <Field>
        <FieldLabel>{t('signal.multi.aggregationMethod')}</FieldLabel>
        <RadioGroup
          value={aggregationMethod}
          onValueChange={(v) => onAggregationMethodChange(v as AggregationMethod)}
          className="grid grid-cols-3 gap-3"
        >
          {AGGREGATION_METHODS.map((m) => {
            const id = `agg-${m.value}`;
            return (
              <div key={m.value} className="flex items-center gap-2">
                <RadioGroupItem value={m.value} id={id} />
                <Label htmlFor={id}>{t(m.label)}</Label>
              </div>
            );
          })}
        </RadioGroup>
        <FieldDescription>{t(AGGREGATION_DESC[aggregationMethod])}</FieldDescription>
      </Field>
    </section>
  );
}

/** 回测参数 section Props */
type BacktestParamsSectionProps = Pick<
  MultiSignalParamsProps,
  'ticker' | 'startDate' | 'endDate' | 'onTickerChange' | 'onStartDateChange' | 'onEndDateChange'
>;

/**
 * 回测参数 section：标的 / 开始日期 / 结束日期，三列响应式 grid。
 * @param props - 见 BacktestParamsSectionProps
 * @returns 渲染的回测参数 section
 */
function BacktestParamsSection({
  ticker,
  startDate,
  endDate,
  onTickerChange,
  onStartDateChange,
  onEndDateChange,
}: BacktestParamsSectionProps) {
  const { t } = useTranslation();
  const startId = useId();
  const endId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h3 text-fg">{t('signal.multi.backtestParams')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TickerField value={ticker} onChange={onTickerChange} />
        <Field>
          <FieldLabel htmlFor={startId}>{t('signal.common.startDate')}</FieldLabel>
          <Input
            id={startId}
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>{t('signal.common.endDate')}</FieldLabel>
          <Input
            id={endId}
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </Field>
      </div>
    </section>
  );
}

/**
 * 多信号聚合参数面板（信号列表 + 聚合配置 + 回测参数 + 运行按钮）。
 * @param props - 见 MultiSignalParamsProps
 * @returns 渲染的参数面板
 */
export function MultiSignalParamsPanel(props: MultiSignalParamsProps) {
  return (
    <div className="flex flex-col gap-5">
      <SignalListSection {...props} />
      <AggregationSection {...props} />
      <BacktestParamsSection {...props} />
      <RunAnalysisButton isLoading={props.isLoading} onClick={props.onRun} />
    </div>
  );
}
