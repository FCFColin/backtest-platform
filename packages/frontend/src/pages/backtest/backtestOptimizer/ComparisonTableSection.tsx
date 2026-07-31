import { useTranslation } from 'react-i18next';
import { SortableTable } from '../../../components/SortableTable.js';
import { TABLE_COLUMNS, OBJECTIVE_SORT_KEY } from '../backtestOptimizerUtils.js';
import type { ComparisonTableSectionProps } from './types.js';
export function ComparisonTableSection({ results, objective }: ComparisonTableSectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-3 mt-6 text-body font-semibold text-fg">{t('backtest.optimizer.comparisonTable')}</div>
      {results.length > 0 ? <SortableTable columns={TABLE_COLUMNS} data={results} initialSortKey={OBJECTIVE_SORT_KEY[objective]} initialSortDir="desc" /> : <div className="py-6 text-center text-body text-fg-tertiary">{t('backtest.optimizer.noConstraintMatch')}</div>}
    </>
  );
}
