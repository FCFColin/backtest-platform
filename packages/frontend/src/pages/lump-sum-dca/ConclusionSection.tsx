import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { Card } from '@/components/ui/uiComponents';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import type { CompareResult, LumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';
function GrowthCurveChart({ results }: { results: CompareResult[] }) {
  return (
    <div className="relative w-full h-[350px]">
      <svg viewBox="0 0 800 350" className="w-full h-full" preserveAspectRatio="none">
        {results.map((r, idx) => {
          if (!r.growthCurve || r.growthCurve.length < 2) return null;
          const allValues = results.flatMap((x) => x.growthCurve.map((p) => p.value));
          const minVal = Math.min(...allValues);
          const maxVal = Math.max(...allValues);
          const range = maxVal - minVal || 1;
          const points = r.growthCurve
            .map(
              (p, i) =>
                `${(i / (r.growthCurve.length - 1)) * 780 + 10},${340 - ((p.value - minVal) / range) * 320 - 10}`,
            )
            .join(' ');
          return (
            <polyline
              key={r.label}
              points={points}
              fill="none"
              stroke={getPortfolioColor(idx)}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      <div className="flex gap-4 mt-2 justify-center">
        {results.map((r, idx) => (
          <div key={r.label} className="flex items-center gap-1 text-xs">
            <span
              className="inline-block w-3 h-1 rounded"
              style={{ backgroundColor: getPortfolioColor(idx) }}
            />
            <span className="text-fg-tertiary">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
const STATS_ROWS = [
  { key: 'finalValue' as const, label: 'lumpSumDca.stats.finalValue' },
  { key: 'cagr' as const, label: 'stats.cagr' },
  { key: 'stdev' as const, label: 'backtest.stdev' },
  { key: 'maxDrawdown' as const, label: 'Max Drawdown' },
  { key: 'sharpe' as const, label: 'backtest.sharpeRatio' },
  { key: 'sortino' as const, label: 'lumpSumDca.stats.sortino' },
  { key: 'calmar' as const, label: 'lumpSumDca.stats.calmar' },
  { key: 'maxDrawdownDuration' as const, label: 'analysis.maxDrawdownDuration' },
  { key: 'ulcerIndex' as const, label: 'analysis.ulcerIndex' },
];
const REQUIRED_KEYS = new Set(['finalValue', 'cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino']);
type FmtFns = {
  fmtPct: (v: number) => string;
  fmtNum: (v: number) => string;
  fmtMoney: (v: number) => string;
};
function StatsTable({ results, fmtPct, fmtNum, fmtMoney }: FmtFns & { results: CompareResult[] }) {
  const { t } = useTranslation();
  const fmtVal = (key: string, v: number) => {
    if (key === 'finalValue') return fmtMoney(v);
    if (key === 'maxDrawdownDuration') return t('{{count}} days', { count: v });
    if (['cagr', 'stdev', 'maxDrawdown'].includes(key)) return fmtPct(v);
    return fmtNum(v);
  };
  const columns: SimpleTableColumn<(typeof STATS_ROWS)[number]>[] = [
    {
      key: 'metric',
      label: t('Metric'),
      render: (row) => <span className="text-fg-secondary">{t(row.label)}</span>,
    },
    ...results.map((r, idx) => ({
      key: r.label,
      label: (
        <>
          <span
            className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
            style={{ backgroundColor: getPortfolioColor(idx) }}
          />
          {r.label}
        </>
      ),
      align: 'right' as const,
      render: (row: (typeof STATS_ROWS)[number]) =>
        r[row.key] != null ? fmtVal(row.key, r[row.key] as number) : '\u2014',
    })),
  ];
  const data = STATS_ROWS.filter(
    (row) => results.some((res) => res[row.key] != null) || REQUIRED_KEYS.has(row.key),
  );
  return <SimpleTable columns={columns} data={data} rowKey={(row) => row.key} />;
}
function ConclStatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-elevated p-3">
      <div className="mb-1 text-caption text-fg-tertiary">{title}</div>
      <div
        className="font-mono text-body font-semibold"
        style={{ color: color ?? 'hsl(var(--fg-secondary))' }}
      >
        {value}
      </div>
    </div>
  );
}
function ConclusionText({
  lsWins,
  ls,
  dca,
  fmtPct,
  fmtMoney,
  finalValueDiffPct,
}: {
  lsWins: boolean;
  ls: CompareResult;
  dca: CompareResult;
  finalValueDiffPct: number;
} & Pick<FmtFns, 'fmtPct' | 'fmtMoney'>) {
  const { t } = useTranslation();
  return (
    <div className="text-body leading-relaxed text-fg-secondary">
      {lsWins ? (
        <>
          {t('In the selected time range, ')}
          <strong style={{ color: getPortfolioColor(0) }}>{t('Lump Sum')}</strong>
          {t(
            "has a higher final value ({{lsValue}} vs {{dcaValue}}), exceeding by {{pct}}%. However, Lump Sum's max drawdown ({{lsMdd}}) is typically larger than DCA's ({{dcaMdd}}), bearing greater psychological pressure in falling markets.",
            {
              lsValue: fmtMoney(ls.finalValue),
              dcaValue: fmtMoney(dca.finalValue),
              pct: finalValueDiffPct.toFixed(1),
              lsMdd: fmtPct(ls.maxDrawdown),
              dcaMdd: fmtPct(dca.maxDrawdown),
            },
          )}
        </>
      ) : (
        <>
          {t('In the selected time range, ')}
          <strong style={{ color: getPortfolioColor(1) }}>{t('DCA')}</strong>
          {t(
            'has a higher final value ({{dcaValue}} vs {{lsValue}}), exceeding by {{pct}}%. DCA reduces average cost through batch purchases, achieving better returns in falling markets.',
            {
              dcaValue: fmtMoney(dca.finalValue),
              lsValue: fmtMoney(ls.finalValue),
              pct: finalValueDiffPct.toFixed(1),
            },
          )}
        </>
      )}
    </div>
  );
}
function ConclusionAnalysis({
  ls,
  dca,
  fmtPct,
  fmtMoney,
}: { ls: CompareResult; dca: CompareResult } & Pick<FmtFns, 'fmtPct' | 'fmtMoney'>) {
  const { t } = useTranslation();
  const lsWins = ls.finalValue > dca.finalValue;
  const finalValueDiff = Math.abs(ls.finalValue - dca.finalValue);
  const finalValueDiffPct = ls.finalValue > 0 ? (finalValueDiff / ls.finalValue) * 100 : 0;
  const mddDiff = Math.abs(ls.maxDrawdown - dca.maxDrawdown);
  return (
    <div className="mb-5 rounded-lg bg-input-bg p-4">
      <div className="mb-2.5 flex items-center gap-2">
        {lsWins ? (
          <TrendingUp className="size-5 text-success" />
        ) : (
          <TrendingDown className="size-5 text-brand" />
        )}
        <span className="text-body font-semibold text-fg">{t('Conclusion Analysis')}</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <ConclStatCard
          title={t('Winning Strategy')}
          value={lsWins ? t('Lump Sum') : t('DCA')}
          color={lsWins ? getPortfolioColor(0) : getPortfolioColor(1)}
        />
        <ConclStatCard
          title={t('Final Value Difference')}
          value={
            <>
              {fmtMoney(finalValueDiff)}{' '}
              <span className="text-caption text-fg-tertiary">
                ({finalValueDiffPct.toFixed(1)}%)
              </span>
            </>
          }
        />
        <ConclStatCard title={t('Max Drawdown Difference')} value={fmtPct(mddDiff)} />
      </div>
      <ConclusionText
        lsWins={lsWins}
        ls={ls}
        dca={dca}
        fmtPct={fmtPct}
        fmtMoney={fmtMoney}
        finalValueDiffPct={finalValueDiffPct}
      />
    </div>
  );
}
function RiskWarning({ lsWins }: { lsWins: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-input-bg p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="text-body leading-relaxed text-fg-tertiary">
        <strong className="text-fg-secondary">{t('Risk Warning:')}</strong>
        {lsWins
          ? t(
              'Although Lump Sum performs better in this historical period, this is a hindsight result. Lump Sum carries greater timing risk at entry; entering at market peaks may cause significant losses. While DCA has a lower final value, it reduces timing risk through staggered entries, suitable for investors with lower risk tolerance.',
            )
          : t(
              'DCA performs better in this historical period, indicating the market experienced significant volatility or declines during this time. DCA reduces average cost through batch purchases, but if the market continues to rise, Lump Sum typically achieves higher returns. Investment decisions should consider personal risk tolerance and market judgment.',
            )}
        {t('Historical performance does not guarantee future returns.')}
      </div>
    </div>
  );
}
export function LsDcaResultsCard({
  s,
  fmtPct,
  fmtNum,
  fmtMoney,
}: FmtFns & { s: LumpSumVsDCAState }) {
  const { t } = useTranslation();
  if (s.results.length !== 2) return null;
  return (
    <Card className="p-5">
      <ConclusionAnalysis
        ls={s.results[0]}
        dca={s.results[1]}
        fmtPct={fmtPct}
        fmtMoney={fmtMoney}
      />
      <div className="mb-3 text-body font-semibold text-fg">{t('Growth Curve Comparison')}</div>
      <GrowthCurveChart results={s.results} />
      <div className="mb-3 mt-6 text-body font-semibold text-fg">{t('Statistics Comparison')}</div>
      <StatsTable results={s.results} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
      <RiskWarning lsWins={s.results[0].finalValue > s.results[1].finalValue} />
    </Card>
  );
}
