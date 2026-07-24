/** @file 通用图表卡片容器：基于 shadcn Card，可选拓展标题与 CSV 导出按钮，内部渲染具体图表 */
import type { CSSProperties, ReactNode } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { ChartExporter } from './ChartExporter.js';

/** ChartCard 组件 Props */
interface ChartCardProps {
  /** 卡片标题，未传时不渲染标题行 */
  title?: ReactNode;
  /** 图表数据，用于 CSV 导出；与 `csvFilename` 同时提供时才渲染导出按钮 */
  data?: Array<Record<string, string | number>>;
  /** 导出文件名（不含扩展名）；与 `data` 同时提供时才渲染导出按钮 */
  csvFilename?: string;
  /** 标题栏额外操作按钮（如 log scale 切换），位于导出按钮左侧 */
  headerExtra?: ReactNode;
  /** 图表内容 */
  children: ReactNode;
  /** 透传到外层 Card 的 style */
  style?: CSSProperties;
  /** 合并到外层 Card 的 className */
  className?: string;
}

/**
 * 通用图表卡片容器。
 *
 * 基于 shadcn Card（CardHeader + CardContent）实现紧凑的图表外壳：
 * 标题行与可选的导出按钮/额外操作横向排列于 CardHeader，图表内容置于 CardContent。
 * @param props - 见 ChartCardProps
 * @returns 渲染的图表卡片
 */
export default function ChartCard({
  title,
  data,
  csvFilename,
  headerExtra,
  children,
  style,
  className,
}: ChartCardProps) {
  const hasTitle = title != null;
  const showExporter = data !== undefined && csvFilename !== undefined;
  const hasHeaderExtra = headerExtra != null;
  const hasRightContent = showExporter || hasHeaderExtra;

  if (!hasTitle) {
    return (
      <Card className={className} style={style}>
        <CardContent className="p-4 pt-4">{children}</CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} style={style}>
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pt-4 pb-3">
        <div className="text-h3 font-semibold text-fg">{title}</div>
        {hasRightContent && (
          <div className="flex items-center gap-2">
            {hasHeaderExtra && headerExtra}
            {showExporter && <ChartExporter data={data} filename={csvFilename} />}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>
    </Card>
  );
}
