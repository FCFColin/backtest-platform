/**
 * @file StatisticsTable 子组件聚合
 * @description 统计指标表格的子组件统一导出。
 *   合并自 StatisticsGroupRows / StatisticsTableHeader / MetricsRows。
 *   共享类型见 ./types，格式化 helper 见 ./helpers，均已拆分至独立 .ts 文件
 *   以满足 react-refresh/only-export-components 规则。
 *   分组数据 {@link statGroups} 因体量较大保持独立。
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import type { StatRow, StatGroup, MetricImportance } from './types.js';
import { formatValue } from './helpers.js';

// ============ 子组件 ============

/** 统计表表头 Props */
export interface StatisticsTableHeaderProps {
  portfolios: PortfolioResult[];
  /** 指标列最小宽度（默认 320px，自定义指标表可用 160px） */
  minWidth?: string;
}

/** 统计表表头：渲染指标列与各投资组合列，组合列头部展示颜色圆点与名称。 */
export function StatisticsTableHeader({
  portfolios,
  minWidth = '320px',
}: StatisticsTableHeaderProps) {
  const { t } = useTranslation();
  return (
    <tr className="stat-table-header-row">
      <th
        className="stat-table-header-cell stat-table-metric-cell text-[12px] text-left"
        style={{ minWidth }}
      >
        {t('common.metric')}
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="stat-table-header-cell stat-table-value-cell text-[12px] text-right"
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </th>
      ))}
    </tr>
  );
}

/** 指标行渲染 Props */
export interface MetricsRowsProps {
  /** 要渲染的指标行定义列表 */
  rows: StatRow[];
  /** 投资组合列表 */
  portfolios: PortfolioResult[];
}

/**
 * 判断数值应该显示什么颜色：根据higherIsBetter判断
 * - higherIsBetter=true（默认）：正值绿色，负值红色
 * - higherIsBetter=false：正值红色，负值绿色
 */
function getValueColorClass(val: number | undefined, higherIsBetter?: boolean): string {
  if (val == null) return '';
  const positiveIsGood = higherIsBetter !== false;
  if (val > 0) return positiveIsGood ? 'stat-value-positive' : 'stat-value-negative';
  if (val < 0) return positiveIsGood ? 'stat-value-negative' : 'stat-value-positive';
  return '';
}

/**
 * 获取指标行的CSS类名
 */
function getRowClassName(importance?: MetricImportance): string {
  const baseClass = 'stat-table-data-row';
  if (!importance) return baseClass;
  return `${baseClass} stat-row-${importance}`;
}

/**
 * 渲染一组统计指标数据行（不含分组标题行）。
 *
 * 行为：
 * - 跳过所有投资组合在该指标上均无值的行
 * - 可见行按出现顺序交替条纹背景（仅计数可见行，保证条纹一致）
 *
 * 供 StatisticsGroupRows（分组模式）与 CustomMetricsTable（扁平模式）复用，
 * 消除两处重复的行渲染逻辑。
 */
export function MetricsRows({ rows, portfolios }: MetricsRowsProps) {
  const { t } = useTranslation();
  return (
    <>
      {rows.map((row) => {
        const hasAnyValue = portfolios.some((p) => p.statistics[row.key] != null);
        if (!hasAnyValue) return null;
        const rowClass = getRowClassName(row.importance);
        return (
          <tr key={row.key} className={rowClass}>
            <td className="stat-table-metric-cell">{t(row.label)}</td>
            {portfolios.map((p) => {
              const val = p.statistics[row.key] as number | undefined;
              const colorClass = getValueColorClass(val, row.higherIsBetter);
              return (
                <td
                  key={p.name}
                  className={`stat-table-value-cell stat-table-num ${colorClass}`}
                >
                  {formatValue(val, row.fmt)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/** 层级模式指标行渲染 Props */
export interface HierarchicalMetricsRowsProps {
  /** 要渲染的指标行定义列表 */
  rows: StatRow[];
  /** 投资组合列表 */
  portfolios: PortfolioResult[];
  /** 是否展开详细指标 */
  expanded: boolean;
}

/**
 * 层级模式指标行渲染：按核心/重要/详细层级渲染指标，详细指标根据expanded状态显示/隐藏
 */
export function HierarchicalMetricsRows({ rows, portfolios, expanded }: HierarchicalMetricsRowsProps) {
  const { t } = useTranslation();
  const primaryRows = rows.filter(r => r.importance === 'primary');
  const secondaryRows = rows.filter(r => r.importance === 'secondary');
  const detailedRows = rows.filter(r => r.importance === 'detailed');

  const renderRow = (row: StatRow) => {
    const hasAnyValue = portfolios.some((p) => p.statistics[row.key] != null);
    if (!hasAnyValue) return null;
    const rowClass = getRowClassName(row.importance);
    return (
      <tr key={row.key} className={rowClass}>
        <td className="stat-table-metric-cell">{t(row.label)}</td>
        {portfolios.map((p) => {
          const val = p.statistics[row.key] as number | undefined;
          const colorClass = getValueColorClass(val, row.higherIsBetter);
          return (
            <td
              key={p.name}
              className={`stat-table-value-cell stat-table-num ${colorClass}`}
            >
              {formatValue(val, row.fmt)}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <>
      {primaryRows.map(renderRow)}
      {secondaryRows.map(renderRow)}
      {expanded && detailedRows.map(renderRow)}
    </>
  );
}

/** 统计表分组行 Props */
export interface StatisticsGroupRowsProps {
  /** 当前要渲染的分组 */
  group: StatGroup;
  /** 投资组合列表 */
  portfolios: PortfolioResult[];
  /** 表格总列数（含指标名列），用于分组标题行 colSpan */
  colCount: number;
}

/**
 * 统计表分组行：渲染单个统计分组。
 * 分组标题行 + 该分组下所有有效指标的数据行（行渲染委托给 {@link MetricsRows}）。
 */
export function StatisticsGroupRows({ group, portfolios, colCount }: StatisticsGroupRowsProps) {
  const { t } = useTranslation();
  return (
    <Fragment key={group.title}>
      <tr className="stat-table-group-row">
        <td colSpan={colCount} className="stat-table-group-cell text-[12px]">
          {t(group.title)}
        </td>
      </tr>
      <MetricsRows rows={group.rows} portfolios={portfolios} />
    </Fragment>
  );
}

/** 展开/收起按钮 Props */
export interface MetricsToggleProps {
  /** 当前是否展开 */
  expanded: boolean;
  /** 切换展开状态 */
  onToggle: () => void;
  /** 表格总列数 */
  colCount: number;
}

/**
 * 展开/收起详细指标按钮
 */
export function MetricsToggle({ expanded, onToggle, colCount }: MetricsToggleProps) {
  const { t } = useTranslation();
  return (
    <tr className="stat-toggle-row">
      <td colSpan={colCount}>
        <button type="button" className="stat-toggle-button" onClick={onToggle}>
          <span className="stat-toggle-arrow" style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
            ▼
          </span>
          {expanded ? t('results.hideDetailedMetrics') : t('results.showDetailedMetrics')}
        </button>
      </td>
    </tr>
  );
}
