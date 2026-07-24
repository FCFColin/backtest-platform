/**
 * @file 信号页面公共参数面板组件
 * @description 抽取 SignalAnalyzerPage/DualSignalPage/MultiSignalPage 共用的常量与参数子组件：
 * 指标常量、标的代码输入、日期范围输入、运行按钮。各页面差异较大（参数结构不同），
 * 故仅抽取最小公共部分，避免过度抽象。
 */
import { useId } from 'react';
import type { ReactNode } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** 技术指标列表（与后端 SignalAnalysisRequest.indicator 枚举对齐） */
export const INDICATORS = ['SMA', 'EMA', 'RSI', 'MACD', 'Bollinger'] as const;

/** 标的代码输入字段 Props */
interface TickerFieldProps {
  /** 当前标的代码 */
  value: string;
  /** 标的代码变更回调 */
  onChange: (v: string) => void;
  /** 占位文本，未传则使用 i18n 默认值 */
  placeholder?: string;
}

/**
 * 标的代码输入字段
 *
 * 复用于三个信号页面，统一 label、placeholder、样式。
 * @param props - 见 TickerFieldProps
 * @returns 渲染的标的代码 Field
 */
export function TickerField({ value, onChange, placeholder }: TickerFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{t('signal.common.tickerLabel')}</FieldLabel>
      <Input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('signal.common.tickerPlaceholder')}
      />
    </Field>
  );
}

/** 日期范围输入字段 Props */
interface DateRangeFieldsProps {
  /** 开始日期（YYYY-MM-DD） */
  startDate: string;
  /** 结束日期（YYYY-MM-DD） */
  endDate: string;
  /** 开始日期变更回调 */
  onStartDateChange: (v: string) => void;
  /** 结束日期变更回调 */
  onEndDateChange: (v: string) => void;
}

/**
 * 日期范围输入字段（开始 / 结束日期并排）
 *
 * 三个信号页面共享同一日期范围选择 UI。
 * @param props - 见 DateRangeFieldsProps
 * @returns 渲染的日期范围 Field 组
 */
export function DateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeFieldsProps) {
  const { t } = useTranslation();
  const startId = useId();
  const endId = useId();
  return (
    <div className="grid grid-cols-2 gap-4">
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
  );
}

/** 运行按钮 Props */
interface RunAnalysisButtonProps {
  /** 是否加载中 */
  isLoading: boolean;
  /** 点击回调 */
  onClick: () => void;
  /** 按钮文本，未传则使用 i18n 默认值 */
  text?: string;
  /** 加载中文本，未传则使用 i18n 默认值 */
  loadingText?: string;
  /** 自定义按钮左侧图标，默认 Play 图标 */
  icon?: ReactNode;
}

/**
 * 信号页面的「开始分析」运行按钮
 *
 * 统一 primary Button + Play 图标 + 加载态文案。
 * @param props - 见 RunAnalysisButtonProps
 * @returns 渲染的运行按钮
 */
export function RunAnalysisButton({
  isLoading,
  onClick,
  text,
  loadingText,
  icon = <Play className="size-4" />,
}: RunAnalysisButtonProps) {
  const { t } = useTranslation();
  return (
    <Button variant="primary" onClick={onClick} disabled={isLoading} className="w-full sm:w-auto">
      {isLoading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingText ?? t('signal.common.analyzing')}
        </>
      ) : (
        <>
          {icon}
          {text ?? t('signal.common.startAnalysis')}
        </>
      )}
    </Button>
  );
}
