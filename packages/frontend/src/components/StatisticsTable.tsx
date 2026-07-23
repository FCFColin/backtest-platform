/**
 * @file 统计指标表格
 * @description 展示各投资组合的核心统计指标对比，支持完整与概览两种模式。
 *   主文件作为组合容器：接收 props、选择分组数据、组合子组件渲染。
 *   分组数据、子组件、helper 已拆分至 ./statistics-table/ 子目录。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from './ChartCard.js';
import {
  StatisticsTableHeader,
  HierarchicalMetricsRows,
  MetricsToggle,
  StatisticsGroupRows,
} from './statistics-table/index.js';
import {
  STAT_GROUPS,
  COMPACT_GROUPS,
  HIERARCHICAL_METRICS,
} from './statistics-table/statGroups.js';

/** 统计指标表格 Props */
export interface StatisticsTableProps {
  portfolios: PortfolioResult[];
  /** 概览模式：只显示核心指标 */
  compact?: boolean;
  /** 层级模式：主次分明的指标展示（回测结果页面使用） */
  hierarchical?: boolean;
  /** 层级模式下是否默认展开详细指标，默认 false */
  defaultExpanded?: boolean;
}

export default function StatisticsTable({
  portfolios,
  compact,
  hierarchical,
  defaultExpanded = false,
}: StatisticsTableProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (portfolios.length === 0) {
    return (
      <ChartCard>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('components.statisticsTable.noData')}
        </div>
      </ChartCard>
    );
  }

  const colCount = 1 + portfolios.length;

  if (hierarchical) {
    return (
      <ChartCard title={t('components.statisticsTable.title')}>
        <div className="overflow-x-auto">
          <table className="stat-table w-full">
            <thead>
              <StatisticsTableHeader portfolios={portfolios} />
            </thead>
            <tbody>
              <HierarchicalMetricsRows
                rows={HIERARCHICAL_METRICS}
                portfolios={portfolios}
                expanded={expanded}
              />
              <MetricsToggle
                expanded={expanded}
                onToggle={() => setExpanded(!expanded)}
                colCount={colCount}
              />
            </tbody>
          </table>
        </div>
      </ChartCard>
    );
  }

  const groups = compact ? COMPACT_GROUPS : STAT_GROUPS;

  return (
    <ChartCard title={t('components.statisticsTable.title')}>
      <div className="overflow-x-auto">
        <table className="stat-table w-full">
          <thead>
            <StatisticsTableHeader portfolios={portfolios} />
          </thead>
          <tbody>
            {groups.map((group) => (
              <StatisticsGroupRows
                key={group.title}
                group={group}
                portfolios={portfolios}
                colCount={colCount}
              />
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
