/**
 * @file 蒙特卡洛结果 - 汇总 Tab
 * @description 展示各指标的百分位分布表（Min/P10/.../Max/Std）
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import type { MonteCarloResult } from '@backtest/shared';
import { buildSummaryData, SUMMARY_STATS } from './monteCarloTransforms.js';

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
  if (!rows) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr>
              <th className="border-b-2 border-border-strong px-3 py-2 text-left text-caption font-semibold text-fg-tertiary">
                {t('monteCarlo.results.metric')}
              </th>
              {SUMMARY_STATS.map((s) => (
                <th
                  key={s}
                  className="border-b-2 border-border-strong px-3 py-2 text-right text-caption font-semibold text-fg-tertiary"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="border-b border-border-subtle px-3 py-2 text-label font-medium text-fg">
                  {row.metric}
                </td>
                {SUMMARY_STATS.map((s) => (
                  <td
                    key={s}
                    className="border-b border-border-subtle px-3 py-2 text-right font-mono tabular-nums text-fg-secondary"
                  >
                    {row.values[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
