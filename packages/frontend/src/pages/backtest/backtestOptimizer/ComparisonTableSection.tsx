/**
 * @file 组合对比表
 * @description 全部参数组合的指标对比表，按优化目标默认降序；空结果时显示提示。
 */
import { useTranslation } from 'react-i18next';
import { SortableTable } from '../../../components/SortableTable.js';
import { TABLE_COLUMNS, OBJECTIVE_SORT_KEY } from '../backtestOptimizerUtils.js';
import type { ComparisonTableSectionProps } from './types.js';

export function ComparisonTableSection({ results, objective }: ComparisonTableSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        {t('backtest.optimizer.comparisonTable')}
      </div>
      {results.length > 0 ? (
        <SortableTable
          columns={TABLE_COLUMNS}
          data={results}
          initialSortKey={OBJECTIVE_SORT_KEY[objective]}
          initialSortDir="desc"
        />
      ) : (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 13 }}>
          {t('backtest.optimizer.noConstraintMatch')}
        </div>
      )}
    </>
  );
}
