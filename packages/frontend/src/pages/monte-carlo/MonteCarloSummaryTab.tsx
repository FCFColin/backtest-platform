/**
 * @file 蒙特卡洛结果 - 汇总 Tab
 * @description 展示各指标的百分位分布表（Min/P10/.../Max/Std）
 */
import { useTranslation } from 'react-i18next';
import type { MonteCarloResult } from '@backtest/shared';
import { buildSummaryData, SUMMARY_STATS } from './monteCarloTransforms.js';
import { EMPTY_DATA_STYLE } from './monteCarloSharedConstants.js';

/** 汇总 Tab：各指标 × 百分位统计表 */
export function MonteCarloSummaryTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const rows = buildSummaryData(r, startingValue, t);
  if (!rows) return <div style={EMPTY_DATA_STYLE}>{t('monteCarlo.results.noData')}</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderBottom: '2px solid var(--border-soft)',
                color: 'var(--text-muted)',
                fontWeight: 600,
              }}
            >
              {t('monteCarlo.results.metric')}
            </th>
            {SUMMARY_STATS.map((s) => (
              <th
                key={s}
                style={{
                  textAlign: 'right',
                  padding: '8px 12px',
                  borderBottom: '2px solid var(--border-soft)',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-soft)',
                  fontWeight: 500,
                  color: 'var(--text-strong)',
                }}
              >
                {row.metric}
              </td>
              {SUMMARY_STATS.map((s) => (
                <td
                  key={s}
                  style={{
                    textAlign: 'right',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--border-soft)',
                    fontFamily: 'monospace',
                    color: 'var(--text-body)',
                  }}
                >
                  {row.values[s]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
