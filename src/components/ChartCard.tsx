/**
 * @file 通用图表卡片容器
 * @description 统一的图表卡片外壳，包含标题与 CSV 导出按钮，内部渲染具体图表组件。
 *   使用项目现有 CSS 变量与 chart-card 样式保持风格一致。
 * @example
 * <ChartCard title="回撤" data={mergedData} csvFilename="drawdown">
 *   <ResponsiveContainer width="100%" height={300}>...</ResponsiveContainer>
 * </ChartCard>
 */
import type { ReactNode } from 'react';
import { ChartExporter } from './ChartExporter';

/** ChartCard 组件 Props */
export interface ChartCardProps {
  /** 卡片标题 */
  title: string;
  /** 图表数据，用于 CSV 导出（建议传入完整数据以保证导出精度） */
  data: Array<Record<string, string | number>>;
  /** 导出文件名（不含扩展名） */
  csvFilename?: string;
  /** 图表内容 */
  children: ReactNode;
}

/**
 * 图表卡片容器
 *
 * - 卡片式布局（chart-card 样式）
 * - 标题居左，CSV 导出按钮居右
 * - children 为实际图表组件
 */
export default function ChartCard({ title, data, csvFilename, children }: ChartCardProps) {
  return (
    <div className="chart-card">
      <div className="flex items-center justify-between mb-3">
        <div className="chart-card-title mb-0">{title}</div>
        <ChartExporter data={data} filename={csvFilename} />
      </div>
      {children}
    </div>
  );
}
