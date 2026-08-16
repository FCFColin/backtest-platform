import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type PortfolioResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { SortableTable, type TableColumn } from './tables.js';
import { fmtPct } from '@/utils/format';
import { Input, PortfolioLabel } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import ChartCard from './ChartCard.js';
import { TableEmpty } from '@/components/stateDisplay.js';
interface TurnoverTaxReportProps {
  portfolios: PortfolioResult[];
}
interface TurnoverRow {
  name: string;
  turnover: number | null; // 年化周转率（小数形式，如 0.35 表示 35%）
  taxDrag: number | null; // 年化税务拖累（小数形式）
  observations: number; // 配置历史采样点数
  years: number; // 覆盖年数
}
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
function computeTurnover(
  allocationHistory: Array<{ date: string; weights: number[] }> | undefined,
): { turnover: number | null; observations: number; years: number } {
  if (!allocationHistory || allocationHistory.length < 2) {
    return { turnover: null, observations: allocationHistory?.length ?? 0, years: 0 };
  }
  let totalTurnover = 0;
  for (let i = 1; i < allocationHistory.length; i++) {
    const prev = allocationHistory[i - 1].weights;
    const cur = allocationHistory[i].weights;
    const n = Math.min(prev.length, cur.length);
    let sumAbs = 0;
    for (let j = 0; j < n; j++) {
      sumAbs += Math.abs(cur[j] - prev[j]);
    }
    totalTurnover += sumAbs / 2;
  }
  const startT = new Date(allocationHistory[0].date).getTime();
  const endT = new Date(allocationHistory[allocationHistory.length - 1].date).getTime();
  const years = (endT - startT) / MS_PER_YEAR;
  const annualized = years > 0 ? totalTurnover / years : 0;
  return { turnover: annualized, observations: allocationHistory.length, years };
}
function buildTurnoverColumns(
  portfolios: PortfolioResult[],
  t: (key: string) => string,
): TableColumn<TurnoverRow>[] {
  const rightCell = (children: ReactNode, cls?: string) => (
    <span className={cn('font-mono tabular-nums text-right block', cls)}>{children}</span>
  );
  return [
    {
      key: 'name',
      label: t('Portfolio'),
      render: (row) => {
        const idx = portfolios.findIndex((p) => p.name === row.name);
        return <PortfolioLabel name={row.name} color={getPortfolioColor(idx)} />;
      },
    },
    {
      key: 'turnover',
      label: t('Annual Turnover'),
      align: 'right',
      render: (row) => rightCell(fmtPct(row.turnover), 'text-fg'),
      sortValue: (row) => row.turnover ?? -1,
    },
    {
      key: 'taxDrag',
      label: t('Tax Drag'),
      align: 'right',
      render: (row) =>
        rightCell(fmtPct(row.taxDrag), row.taxDrag != null ? 'text-danger' : 'text-fg-tertiary'),
      sortValue: (row) => row.taxDrag ?? -1,
    },
    {
      key: 'observations',
      label: t('Observations'),
      align: 'right',
      render: (row) => rightCell(row.observations, 'text-fg-secondary'),
      sortValue: (row) => row.observations,
    },
    {
      key: 'years',
      label: t('Years'),
      align: 'right',
      render: (row) =>
        rightCell(row.years > 0 ? row.years.toFixed(1) : '\u2014', 'text-fg-secondary'),
      sortValue: (row) => row.years,
    },
  ];
}
function TaxRateInput({
  taxRate,
  setTaxRate,
}: {
  taxRate: number;
  setTaxRate: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <label className="text-caption font-medium text-fg-secondary mb-0">
        {t('Tax Rate Assumption')}
      </label>
      <div className="flex items-center gap-2 w-[120px]">
        <Input
          type="number"
          value={taxRate}
          onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
          min={0}
          max={100}
          step={1}
          className="font-mono tabular-nums"
        />
        <span className="text-caption text-fg-tertiary shrink-0">%</span>
      </div>
      <span className="text-caption text-fg-tertiary">
        {t('Assumes a capital gains tax rate of')}
      </span>
    </div>
  );
}
export default function TurnoverTaxReport({ portfolios }: TurnoverTaxReportProps) {
  const { t } = useTranslation();
  const [taxRate, setTaxRate] = useState(20);
  const rows: TurnoverRow[] = useMemo(() => {
    return portfolios.map((p) => {
      const { turnover, observations, years } = computeTurnover(p.allocationHistory);
      const taxDrag = turnover != null ? turnover * (taxRate / 100) : null;
      return { name: p.name, turnover, taxDrag, observations, years };
    });
  }, [portfolios, taxRate]);
  const hasAnyTurnover = rows.some((r) => r.turnover != null);
  const columns = buildTurnoverColumns(portfolios, t);
  return (
    <ChartCard title={t('Turnover & Tax Report')}>
      <div className="text-caption text-fg-tertiary mb-3">
        {t('Shows annual turnover and tax drag for each portfolio, assuming a tax rate of')}
      </div>
      <TaxRateInput taxRate={taxRate} setTaxRate={setTaxRate} />
      {hasAnyTurnover ? (
        <SortableTable
          columns={columns}
          data={rows}
          initialSortKey="turnover"
          initialSortDir="desc"
        />
      ) : (
        <TableEmpty message={t('No data')} />
      )}
    </ChartCard>
  );
}
