/** @file 通用图表卡片容器：可选拓展标题与 CSV 导出按钮，内部渲染具体图表 */
import type { CSSProperties, ReactNode } from 'react';
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
  /** 透传到外层 div 的 style */
  style?: CSSProperties;
  /** 合并到外层 div 的 className（与 `chart-card` 拼接） */
  className?: string;
}

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
  const cardClassName = className ? `chart-card ${className}` : 'chart-card';

  if (!hasTitle) {
    return (
      <div className={cardClassName} style={style}>
        {children}
      </div>
    );
  }

  if (!hasRightContent) {
    return (
      <div className={cardClassName} style={style}>
        <div className="chart-card-title">{title}</div>
        {children}
      </div>
    );
  }

  const showBoth = hasHeaderExtra && showExporter;
  const rightContent = (
    <>
      {hasHeaderExtra && headerExtra}
      {showExporter && <ChartExporter data={data} filename={csvFilename} />}
    </>
  );

  return (
    <div className={cardClassName} style={style}>
      <div className="flex items-center justify-between mb-3">
        <div className="chart-card-title mb-0">{title}</div>
        {showBoth ? <div className="flex items-center gap-2">{rightContent}</div> : rightContent}
      </div>
      {children}
    </div>
  );
}
