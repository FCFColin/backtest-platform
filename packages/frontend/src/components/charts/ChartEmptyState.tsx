/**
 * @file 图表空数据占位组件
 * @description 当图表数据为空时显示占位状态，避免渲染空白图表造成视觉空白。
 */
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChartEmptyStateProps {
  /** 自定义提示消息，默认走 i18n */
  message?: string;
  /** 自定义高度，默认 280px */
  height?: string;
}

/**
 * 图表空数据占位组件。
 * @param props - message/height。
 * @returns 占位元素。
 */
export function ChartEmptyState({ message, height = '280px' }: ChartEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-center border border-dashed border-border-subtle rounded-lg"
      style={{ height }}
      data-testid="chart-empty-state"
    >
      <div className="text-center text-fg-tertiary">
        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-caption">{message ?? t('chart.emptyData')}</p>
      </div>
    </div>
  );
}
