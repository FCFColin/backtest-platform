import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { CHART_COLORS } from '@backtest/shared/types';
import type { CompareResult } from './types.js';
import { STATS_ROWS, REQUIRED_KEYS } from './types.js';

function StatsTable({
  results,
  fmtPct,
  fmtNum,
  fmtMoney,
}: {
  results: CompareResult[];
  fmtPct: (v: number) => string;
  fmtNum: (v: number) => string;
  fmtMoney: (v: number) => string;
}) {
  const fmtVal = (key: string, v: number) => {
    if (key === 'finalValue') return fmtMoney(v);
    if (key === 'maxDrawdownDuration') return `${v} 天`;
    if (['cagr', 'stdev', 'maxDrawdown'].includes(key)) return fmtPct(v);
    return fmtNum(v);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th
              className="text-[12px] font-semibold text-left py-2.5 px-3"
              style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}
            >
              指标
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
                  {row.label}
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

function GrowthCurveChart({ results }: { results: CompareResult[] }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 350 }}>
      <svg
        viewBox="0 0 800 350"
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="none"
      >
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
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
            />
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
        {results.map((r, idx) => (
          <div
            key={r.label}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
          >
            <span
              className="inline-block w-3 h-1 rounded"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConclusionAnalysis({
  ls,
  dca,
  fmtPct,
  fmtMoney,
}: {
  ls: CompareResult;
  dca: CompareResult;
  fmtPct: (v: number) => string;
  fmtMoney: (v: number) => string;
}) {
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
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>结论分析</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            padding: 12,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>胜出策略</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: lsWins ? CHART_COLORS[0] : CHART_COLORS[1],
            }}
          >
            {lsWins ? '一次性投资' : '定投'}
          </div>
        </div>
        <div
          style={{
            padding: 12,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>终值差异</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-body)',
            }}
          >
            {fmtMoney(finalValueDiff)}{' '}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ({finalValueDiffPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div
          style={{
            padding: 12,
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-control)',
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            最大回撤差异
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'monospace',
              color: 'var(--text-body)',
            }}
          >
            {fmtPct(mddDiff)}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
        {lsWins ? (
          <>
            在选定的时间范围内，<strong style={{ color: CHART_COLORS[0] }}>一次性投资</strong>
            的终值更高（{fmtMoney(ls.finalValue)} vs {fmtMoney(dca.finalValue)}），高出
            {finalValueDiffPct.toFixed(1)}%。但一次性投资的最大回撤（{fmtPct(ls.maxDrawdown)}
            ）通常大于定投（{fmtPct(dca.maxDrawdown)}），在下跌市场中承受更大的心理压力。
          </>
        ) : (
          <>
            在选定的时间范围内，<strong style={{ color: CHART_COLORS[1] }}>定投</strong>的终值更高（
            {fmtMoney(dca.finalValue)} vs {fmtMoney(ls.finalValue)}），高出
            {finalValueDiffPct.toFixed(1)}
            %。定投通过分批买入降低了平均成本，在下跌市场中获得了更好的回报。
          </>
        )}
      </div>
    </div>
  );
}

function RiskWarning({ lsWins }: { lsWins: boolean }) {
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
        <strong style={{ color: 'var(--text-body)' }}>风险提示：</strong>
        {lsWins
          ? '虽然一次性投资在此历史区间内表现更优，但这是事后结果。一次性投资在入场时点选择上风险更大，若在市场高点入场可能遭受重大损失。定投虽然终值较低，但通过分散入场时点降低了择时风险，适合风险偏好较低的投资者。'
          : '定投在此历史区间内表现更优，说明市场在此期间经历了较大的波动或下跌阶段。定投通过分批买入降低了平均成本，但若市场持续上涨，一次性投资通常能获得更高收益。投资决策应结合个人风险承受能力和市场判断。'}
        历史表现不代表未来收益。
      </div>
    </div>
  );
}

export { StatsTable, GrowthCurveChart, ConclusionAnalysis, RiskWarning };
