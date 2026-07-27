/**
 * @file 合成标的 Tooltip 组件
 * @description 当 ticker 是合成标的（meta.isSynthetic=true）时，hover 显示名称与
 *   历史起始日期。非合成标的或 meta 未加载时直接透传 children。
 *   注：useTickerMeta 当前返回 { ticker, name, exchange, currency, earliestDate?, isSynthetic? }，
 *   不含 syntheticSources 字段，故未渲染数据来源段（如后续 hook 扩展可再补）。
 */
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip.js';
import { useTickerMeta } from '@/hooks/useTickerMeta.js';

interface SyntheticTickerTooltipProps {
  ticker: string;
  children: React.ReactNode;
}

/**
 * 合成标的 Tooltip 包装器。
 * @param props - ticker/children
 * @returns Tooltip 包装的元素，或直接透传 children（非合成标的/meta 未加载时）
 */
export function SyntheticTickerTooltip({ ticker, children }: SyntheticTickerTooltipProps) {
  const { t } = useTranslation();
  const meta = useTickerMeta(ticker);

  // 非合成标的或 meta 未加载时直接透传
  if (!meta?.isSynthetic) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          className="max-w-[360px] p-4 bg-elevated border border-border-strong rounded-lg shadow-xl"
          data-testid="synthetic-tooltip"
        >
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="h-4 w-4 text-brand" />
            <span className="text-h3 font-mono">{ticker}</span>
            <span className="text-caption text-fg-tertiary">{t('ticker.synthetic')}</span>
          </div>
          <p className="text-caption text-fg-secondary mb-3">{meta.name}</p>

          {meta.earliestDate && (
            <div className="mt-3 pt-3 border-t border-border-subtle text-caption text-fg-tertiary">
              {t('ticker.historyRange', {
                from: meta.earliestDate,
                years: Math.floor(
                  (Date.now() - new Date(meta.earliestDate).getTime()) /
                    (365.25 * 24 * 3600 * 1000),
                ),
              })}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
