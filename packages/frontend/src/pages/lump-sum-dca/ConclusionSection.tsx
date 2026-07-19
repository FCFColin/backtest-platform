/**
 * @file LumpSumVsDCA 结果区子组件
 * @description 承载结论分析、风险提示、统计对比表与增长曲线的整合卡片
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared';
import { GrowthCurveChart } from '../../components/charts/GrowthCurveChart.js';
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
      <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
        <th
          className="text-[12px] font-semibold text-left py-2.5 px-3"
          style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
        >
          {t('lumpSumDca.stats.metric')}
        </th>
        {results.map((r, idx) => (
          <th
            key={r.label}
            className="text-[12px] font-semibold text-right py-2.5 px-3"
            style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
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
            const hasAnyValue = results.some(
              (r) => r[row.key] !== undefined && r[row.key] !== null,
            );
            if (!hasAnyValue && !REQUIRED_KEYS.has(row.key)) return null;
            return (
              <tr
                key={row.key}
                style={{ backgroundColor: rowIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
              >
                <td
                  className="text-[13px] py-2 px-3"
                  style={{
                    color: 'var(--text-body)',
                    borderBottom: '1px solid var(--border-soft)',
                  }}
                >
                  {t(row.label)}
                </td>
                {results.map((r) => {
                  const val = r[row.key];
                  return (
                    <td
                      key={r.label}
                      className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                      style={{
                        color: 'var(--text-strong)',
                        borderBottom: '1px solid var(--border-soft)',
                      }}
                    >
                      {val !== undefined && val !== null
                        ? fmtVal(row.key, val as number)
                        : '\u2014'}
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
    <div
      style={{
        padding: 12,
        backgroundColor: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-control)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{title}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          fontFamily: 'monospace',
          color: color ?? 'var(--text-body)',
        }}
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
    <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
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
    <div
      style={{
        padding: 16,
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {lsWins ? (
          <TrendingUp className="w-5 h-5" style={{ color: 'var(--success)' }} />
        ) : (
          <TrendingDown className="w-5 h-5" style={{ color: 'var(--brand)' }} />
        )}
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
          {t('lumpSumDca.conclusion.title')}
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 12,
        }}
      >
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
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
    <div
      style={{
        marginTop: 16,
        padding: '12px 16px',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <AlertTriangle
        className="w-4 h-4 flex-shrink-0"
        style={{ color: 'var(--warning)', marginTop: 2 }}
      />
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-body)' }}>
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
 * LumpSumVsDCA 结果整合卡片：结论 + 增长曲线 + 统计表 + 风险提示。
 * 仅当 results 恰好两条（lumpSum + dca）时渲染。
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
    <div className="bt-results-card card">
      <ConclusionAnalysis
        ls={s.results[0]}
        dca={s.results[1]}
        fmtPct={fmtPct}
        fmtMoney={fmtMoney}
      />
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('lumpSumDca.results.growthCurveTitle')}
      </div>
      <GrowthCurveChart results={s.results} />
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          color: 'var(--text-strong)',
          marginBottom: 12,
          marginTop: 24,
        }}
      >
        {t('lumpSumDca.results.statsTitle')}
      </div>
      <StatsTable results={s.results} fmtPct={fmtPct} fmtNum={fmtNum} fmtMoney={fmtMoney} />
      <RiskWarning lsWins={s.results[0].finalValue > s.results[1].finalValue} />
    </div>
  );
}
