/**
 * @file 蒙特卡洛结果共享子组件
 * @description 承载 StatCard / StatsGrid / 组合标签 / 空态与错误态等跨 Tab 复用组件。
 *   Tab 切换栏已由 shadcn Tabs（MonteCarloResults）接管，本文件不再导出 ResultTabBar。
 */
import { useTranslation } from 'react-i18next';
import { fmtDollar } from '@/utils/format';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';

/** 单个统计卡片 */
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md bg-input-bg p-3.5 text-center">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div
        className="font-mono text-h3 font-semibold tabular-nums text-fg"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

/** 顶部统计网格：中位/均值终值 + 保本率 + 模拟次数 */
export function StatsGrid({
  r,
  startingValue,
  numSimulations,
}: {
  r: MonteCarloResult;
  startingValue: number;
  numSimulations: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label={t('monteCarlo.results.medianFinalValue')}
        value={fmtDollar(r.statistics.medianFinalValue * startingValue)}
      />
      <StatCard
        label={t('monteCarlo.results.meanFinalValue')}
        value={fmtDollar(r.statistics.meanFinalValue * startingValue)}
      />
      <StatCard
        label={t('monteCarlo.results.preservationRate')}
        value={`${(r.statistics.successRate * 100).toFixed(1)}%`}
        color="hsl(var(--success))"
      />
      <StatCard
        label={t('monteCarlo.results.numSimulations')}
        value={`${r.perPathMetrics?.length ?? numSimulations}`}
      />
    </div>
  );
}

/** 多组合场景下的组合名标签（仅 portfolioMode=2 渲染） */
export function PortfolioLabel({ label, colorIdx }: { label: string; colorIdx: number }) {
  return (
    <div
      className="mb-3 mt-2 text-h3 font-semibold"
      style={{ color: CHART_COLORS[colorIdx] }}
    >
      {label}
    </div>
  );
}

/** 错误态：作为 results 区内容渲染（外层已由 ToolPageLayout Card 包裹） */
export function McErrorState({ error }: { error: string }) {
  const { t } = useTranslation();
  return (
    <div className="p-6 text-center text-danger">
      {t('monteCarlo.results.simFailed')}: {error}
    </div>
  );
}

/** 空态：尚未运行模拟（外层已由 ToolPageLayout Card 包裹） */
export function McEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="p-12 text-center text-fg-tertiary">{t('monteCarlo.results.noResultsHint')}</div>
  );
}
