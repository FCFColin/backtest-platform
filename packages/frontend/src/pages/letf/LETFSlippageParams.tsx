/**
 * @file LETF Slippage 参数面板
 * @description ETF 选择与时间范围输入，触发滑点分析。
 *   基于 shadcn Field/Input/Button + token 体系，参照 SignalParamsPanel 模式。
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { Field, FieldLabel } from '@/components/form/Field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 参数面板属性 */
interface LETFParamsProps {
  /** LETF 标的代码 */
  letfTicker: string;
  /** 基准标的代码 */
  benchmarkTicker: string;
  /** 杠杆倍数（2 或 3） */
  leverage: number;
  /** 开始日期（YYYY-MM-DD） */
  startDate: string;
  /** 结束日期（YYYY-MM-DD） */
  endDate: string;
  /** 是否加载中 */
  isLoading: boolean;
  /** LETF 标的变更回调 */
  onLetfTickerChange: (v: string) => void;
  /** 基准标的变更回调 */
  onBenchmarkTickerChange: (v: string) => void;
  /** 杠杆倍数变更回调 */
  onLeverageChange: (v: number) => void;
  /** 开始日期变更回调 */
  onStartDateChange: (v: string) => void;
  /** 结束日期变更回调 */
  onEndDateChange: (v: string) => void;
  /** 运行分析回调 */
  onRun: () => void;
}

/** 可选杠杆倍数 */
const LEVERAGE_OPTIONS = [2, 3] as const;

/** 杠杆倍数选择按钮组 Props */
interface LeverageSelectorProps {
  /** 当前杠杆倍数 */
  leverage: number;
  /** 变更回调 */
  onChange: (v: number) => void;
}

/**
 * 杠杆倍数选择按钮组（2x / 3x）。
 *
 * 替代旧版 mini-tabs/mini-tab，使用 token 体系的高对比按钮组样式。
 * @param props - 见 LeverageSelectorProps
 * @returns 渲染的按钮组
 */
function LeverageSelector({ leverage, onChange }: LeverageSelectorProps) {
  return (
    <div className="flex h-10 gap-1.5">
      {LEVERAGE_OPTIONS.map((lev) => {
        const active = leverage === lev;
        return (
          <button
            key={lev}
            type="button"
            onClick={() => onChange(lev)}
            className={cn(
              'h-full rounded-md border px-5 text-body font-medium',
              'transition-colors duration-150',
              active
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-border bg-input-bg text-fg-secondary hover:bg-hover',
            )}
          >
            {lev}x
          </button>
        );
      })}
    </div>
  );
}

/** LETF 代码 / 基准代码 / 杠杆倍数 三列字段组 */
function LetfTickerGrid({
  letfTicker,
  benchmarkTicker,
  leverage,
  onLetfTickerChange,
  onBenchmarkTickerChange,
  onLeverageChange,
}: Pick<
  LETFParamsProps,
  | 'letfTicker'
  | 'benchmarkTicker'
  | 'leverage'
  | 'onLetfTickerChange'
  | 'onBenchmarkTickerChange'
  | 'onLeverageChange'
>) {
  const { t } = useTranslation();
  const letfId = useId();
  const benchId = useId();
  const levId = useId();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Field>
        <FieldLabel htmlFor={letfId}>{t('letf.etf.letfTicker')}</FieldLabel>
        <Input
          id={letfId}
          type="text"
          value={letfTicker}
          onChange={(e) => onLetfTickerChange(e.target.value)}
          placeholder={t('letf.etf.letfTickerPlaceholder')}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={benchId}>{t('letf.etf.benchmarkTicker')}</FieldLabel>
        <Input
          id={benchId}
          type="text"
          value={benchmarkTicker}
          onChange={(e) => onBenchmarkTickerChange(e.target.value)}
          placeholder={t('letf.etf.benchmarkTickerPlaceholder')}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={levId}>{t('letf.etf.leverage')}</FieldLabel>
        <LeverageSelector leverage={leverage} onChange={onLeverageChange} />
      </Field>
    </div>
  );
}

/**
 * LETF Slippage 参数面板。
 *
 * 三列响应式网格：LETF 代码 / 基准代码 / 杠杆倍数；
 * 下方两列日期范围；底部运行按钮。
 * @param props - 见 LETFParamsProps
 * @returns 渲染的参数面板
 */
export function LETFParamsPanel({
  startDate,
  endDate,
  isLoading,
  onStartDateChange,
  onEndDateChange,
  onRun,
  ...rest
}: LETFParamsProps) {
  const { t } = useTranslation();
  const startId = useId();
  const endId = useId();
  return (
    <div className="flex flex-col gap-4">
      <LetfTickerGrid {...rest} />
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor={startId}>{t('letf.dateRange.startDate')}</FieldLabel>
          <Input
            id={startId}
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={endId}>{t('letf.dateRange.endDate')}</FieldLabel>
          <Input
            id={endId}
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button variant="primary" onClick={onRun} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('letf.analyzing')}
            </>
          ) : (
            <>
              <Play className="size-4" />
              {t('letf.startAnalysis')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
