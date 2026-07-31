import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { SortableTable, type Column } from './SortableTable.js';
import { fmtPct } from '@/utils/format';
import { Input } from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import ChartCard from './ChartCard.js';
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
function computeTurnover(allocationHistory: Array<{ date: string; weights: number[] }> | undefined): { turnover: number | null; observations: number; years: number } {
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
function buildTurnoverColumns(portfolios: PortfolioResult[], t: (key: string) => string): Column<TurnoverRow>[] {
  return [
    {
      key: 'name',
      label: t('components.turnoverTaxReport.columns.portfolio'),
      render: (row) => {
        const idx = portfolios.findIndex((p) => p.name === row.name);
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} />
            {row.name}
          </span>
        );
      }
    },
    {
      key: 'turnover',
      label: t('components.turnoverTaxReport.columns.annualTurnover'),
      render: (row) => <span className="font-mono tabular-nums text-right block text-fg">{fmtPct(row.turnover)}</span>,
      sortValue: (row) => row.turnover ?? -1
    },
    {
      key: 'taxDrag',
      label: t('components.turnoverTaxReport.columns.taxDrag'),
      render: (row) => <span className={cn('font-mono tabular-nums text-right block', row.taxDrag != null ? 'text-neg' : 'text-fg-tertiary')}>{fmtPct(row.taxDrag)}</span>,
      sortValue: (row) => row.taxDrag ?? -1
    },
    {
      key: 'observations',
      label: t('components.turnoverTaxReport.columns.observations'),
      render: (row) => <span className="font-mono tabular-nums text-right block text-fg-secondary">{row.observations}</span>,
      sortValue: (row) => row.observations
    },
    {
      key: 'years',
      label: t('components.turnoverTaxReport.columns.years'),
      render: (row) => <span className="font-mono tabular-nums text-right block text-fg-secondary">{row.years > 0 ? row.years.toFixed(1) : '\u2014'}</span>,
      sortValue: (row) => row.years
    }
  ];
}
function TaxRateInput({ taxRate, setTaxRate }: { taxRate: number; setTaxRate: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <label className="text-caption font-medium text-fg-secondary mb-0">{t('components.turnoverTaxReport.taxRateAssumption')}</label>
      <div className="flex items-center gap-2 w-[120px]">
        <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} min={0} max={100} step={1} className="font-mono tabular-nums" />
        <span className="text-caption text-fg-tertiary shrink-0">%</span>
      </div>
      <span className="text-caption text-fg-tertiary">{t('components.turnoverTaxReport.taxRateHint')}</span>
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
    <ChartCard title={t('components.turnoverTaxReport.title')}>
      <div className="text-caption text-fg-tertiary mb-3">{t('components.turnoverTaxReport.description')}</div>
      <TaxRateInput taxRate={taxRate} setTaxRate={setTaxRate} />
      {hasAnyTurnover ? <SortableTable columns={columns} data={rows} initialSortKey="turnover" initialSortDir="desc" /> : <div className="text-body text-fg-tertiary">{t('components.turnoverTaxReport.noData')}</div>}
    </ChartCard>
  );
}
