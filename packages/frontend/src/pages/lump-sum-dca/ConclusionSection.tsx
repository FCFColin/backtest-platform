/**
 * @file LumpSumVsDCA 结果区子组件
 * @description 承载结论分析、风险提示、统计对比表与增长曲线的整合卡片。
 *   就地重构：迁移至 shadcn Card + token 化 Tailwind 样式。
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared';
import { GrowthCurveChart } from '../../components/charts/GrowthCurveChart.js';
import { Card } from '@/components/ui/card';
import type { CompareResult, LumpSumVsDCAState } from '../../hooks/useLumpSumVsDCAState.js';

const STATS_ROWS = [
  { key: 'finalValue' as const, label: 'lumpSumDca.stats.finalValue' },
  { key: 'cagr' as const, label: 'lumpSumDca.stats.cagr' },
  { key: 'stdev' as const, label: 'lumpSumDca.stats.stdev' },
  { key: 'maxDrawdown' as const, label: 'lumpSumDca.stats.maxDrawdown' },
  { key: 'sharpe' as const, label: 'lumpSumDca.stats.sharpe' },
  { key: 'sortino' as const, label: 'lumpSumDca.stats.sortino' },
  { key: 'calmar' as const, label: 'lumpSumDca.stats.calmar' },
  { key: 'maxDrawdownDuration' as const, label: 'lumpSumDca.stats.maxDrawdownDuration' },
  { key: 'ulcerIndex' as const, label: 'lumpSumDca.stats.ulcerIndex' },
];

const REQUIRED_KEYS = new Set(['finalValue', 'cagr', 'stdev', 'maxDrawdown', 'sharpe', 'sortino']);

type FmtFns = {
  fmtPct: (v: number) => string;
  fmtNum: (v: number) => string;
  fmtMoney: (v: number) => string;
};

function StatsTableHead({ results }: { results: CompareResult[] }) {
  const { t } = useTranslation();
  return (
    <thead>
      <tr className="bg-input-bg">
        <th className="border-b-2 border-subtle px-3 py-2.5 text-left text-caption font-semibold text-fg-tertiary">
          {t('lumpSumDca.stats.metric')}
        </th>
        {results.map((r, idx) => (
          <th
            key={r.label}
            className="border-b-2 border-subtle px-3 py-2.5 text-right text-caption font-semibold text-fg-tertiary"
          >
            <span
              className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            {r.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function StatsTable({ results, fmtPct, fmtNum, fmtMoney }: FmtFns & { results: CompareResult[] }) {
  const { t } = useTranslation();
  const fmtVal = (key: string, v: number) => {
    if (key === 'finalValue') return fmtMoney(v);
    if (key === 'maxDrawdownDuration') return t('lumpSumDca.stats.days', { count: v });
    if (['cagr', 'stdev', 'maxDrawdown'].includes(key)) return fmtPct(v);
    return fmtNum(v);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <StatsTableHead results={results} />
        <tbody>
          {STATS_ROWS.map((row, rowIdx) => {
            const hasAnyValue = results.some((r) => r[row.key] != null);
            if (!hasAnyValue && !REQUIRED_KEYS.has(row.key)) return null;
            return (
              <tr key={row.key} className={rowIdx % 2 === 1 ? 'bg-input-bg' : ''}>
                <td className="border-b border-subtle px-3 py-2 text-[13px] text-fg-secondary">
                  {t(row.label)}
                </td>
                {results.map((r) => {
                  const val = r[row.key];
                  return (
                    <td
                      key={r.label}
                      className="border-b border-subtle px-3 py-2 text-right font-mono text-[13px] font-medium text-fg"
                    >
                      {val != null ? fmtVal(row.key, val as number) : '\u2014'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
          {t('lumpSumDca.conclusion.lumpSumWinsBefore')}
          <strong style={{ color: CHART_COLORS[0] }}>{t('lumpSumDca.lumpSumLabel')}</strong>
          {t('lumpSumDca.conclusion.lumpSumWinsAfter', {
            lsValue: fmtMoney(ls.finalValue),
            dcaValue: fmtMoney(dca.finalValue),
            pct: finalValueDiffPct.toFixed(1),
            lsMdd: fmtPct(ls.maxDrawdown),
            dcaMdd: fmtPct(dca.maxDrawdown),
          })}
        </>
      ) : (
        <>
          {t('lumpSumDca.conclusion.dcaWinsBefore')}
          <strong style={{ color: CHART_COLORS[1] }}>{t('lumpSumDca.dcaLabel')}</strong>
          {t('lumpSumDca.conclusion.dcaWinsAfter', {
            dcaValue: fmtMoney(dca.finalValue),
            lsValue: fmtMoney(ls.finalValue),
            pct: finalValueDiffPct.toFixed(1),
          })}
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
        <span className="text-body font-semibold text-fg">
          {t('lumpSumDca.conclusion.title')}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <ConclStatCard
          title={t('lumpSumDca.conclusion.winningStrategy')}
          value={lsWins ? t('lumpSumDca.lumpSumLabel') : t('lumpSumDca.dcaLabel')}
          color={lsWins ? CHART_COLORS[0] : CHART_COLORS[1]}
        />
        <ConclStatCard
          title={t('lumpSumDca.conclusion.finalValueDiff')}
          value={
            <>
              {fmtMoney(finalValueDiff)}{' '}
              <span className="text-caption text-fg-tertiary">
                ({finalValueDiffPct.toFixed(1)}%)
              </span>
            </>
          }
        />
        <ConclStatCard title={t('lumpSumDca.conclusion.maxDrawdownDiff')} value={fmtPct(mddDiff)} />
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
        <strong className="text-fg-secondary">
          {t('lumpSumDca.conclusion.riskWarningTitle')}
        </strong>
        {lsWins
          ? t('lumpSumDca.conclusion.riskWarningLumpSum')
          : t('lumpSumDca.conclusion.riskWarningDca')}
        {t('lumpSumDca.conclusion.historicalDisclaimer')}
      </div>
    </div>
  );
}

/**
 * LsDcaResultsCard: LumpSumVsDCA 结果整合卡片：结论 + 增长曲线 + 统计表 + 风险提示。
 * 仅当 results 恰好两条（lumpSum + dca）时渲染。
 * @param s - 页面状态。
 * @param fmtPct/fmtNum/fmtMoney - 数值格式化函数。
 * @returns 结果卡片元素，results 不是两条时返回 null。
 */
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
      <div className="mb-3 text-body font-semibold text-fg">
        {t('lumpSumDca.results.growthCurveTitle')}
      </div>
      <GrowthCurveChart results={s.results} />
      <div className="mb-3 mt-6 text-body font-semibold text-fg">
        {t('lumpSumDca.results.statsTitle')}
      </div>
      <StatsTable results={s.results} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
      <RiskWarning lsWins={s.results[0].finalValue > s.results[1].finalValue} />
    </Card>
  );
}
