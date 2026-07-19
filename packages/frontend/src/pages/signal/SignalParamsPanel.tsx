/**
 * @file 信号页面公共参数面板组件
 * @description 抽取 SignalAnalyzerPage/DualSignalPage/MultiSignalPage 共用的常量与参数子组件：
 * 指标常量、标的代码输入、日期范围输入、运行按钮。各页面差异较大（参数结构不同），
 * 故仅抽取最小公共部分，避免过度抽象。
 */
import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingButton from '../../components/LoadingButton.js';

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
  /** 字段下方间距（px），默认 8 */
  marginBottom?: number;
}

/**
 * 标的代码输入字段
 *
 * 复用于三个信号页面，统一 label、placeholder、样式。
 */
export function TickerField({ value, onChange, placeholder, marginBottom = 8 }: TickerFieldProps) {
  const { t } = useTranslation();
  return (
    <div className="param-field" style={{ marginBottom }}>
      <span className="param-label">{t('signal.common.tickerLabel')}</span>
      <input
        type="text"
        className="param-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('signal.common.tickerPlaceholder')}
      />
    </div>
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
 */
export function DateRangeFields({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="params-row">
      <div className="param-field">
        <span className="param-label">{t('signal.common.startDate')}</span>
        <input
          type="date"
          className="param-input"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
        />
      </div>
      <div className="param-field">
        <span className="param-label">{t('signal.common.endDate')}</span>
        <input
          type="date"
          className="param-input"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
        />
      </div>
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
 * 信号页面的"开始分析"运行按钮
 *
 * 统一 LoadingButton + Play 图标 + 文案样式。
 */
export function RunAnalysisButton({
  isLoading,
  onClick,
  text,
  loadingText,
  icon = <Play className="w-4 h-4" />,
}: RunAnalysisButtonProps) {
  const { t } = useTranslation();
  return (
    <div className="bt-action-row">
      <LoadingButton
        isLoading={isLoading}
        onClick={onClick}
        loadingText={loadingText ?? t('signal.common.analyzing')}
      >
        {icon}
        {text ?? t('signal.common.startAnalysis')}
      </LoadingButton>
    </div>
  );
}
