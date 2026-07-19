/**
 * @file 蒙特卡洛结果共享子组件
 * @description 承载 StatCard / StatsGrid / TabBar / 空态与错误态等跨 Tab 复用组件
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDollar } from '@/utils/format';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import type { ResultTab } from './monteCarloTypes.js';
import { RESULT_TABS } from './monteCarloSharedConstants.js';

const statCardStyle: CSSProperties = {
  textAlign: 'center',
  padding: 14,
  backgroundColor: 'var(--bg-subtle)',
  borderRadius: 'var(--radius-control)',
};

/** 单个统计卡片 */
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={statCardStyle}>
      <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          fontFamily: 'monospace',
          color: color ?? 'var(--text-strong)',
        }}
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
    <div
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}
    >
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
        color="var(--success)"
      />
      <StatCard
        label={t('monteCarlo.results.numSimulations')}
        value={`${r.perPathMetrics?.length ?? numSimulations}`}
      />
    </div>
  );
}

/** Tab 切换栏 */
export function ResultTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: ResultTab;
  onTabChange: (tab: ResultTab) => void;
}) {
  return (
    <div className="result-tabs" style={{ marginBottom: 16 }}>
      {RESULT_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** 多组合场景下的组合名标签（仅 portfolioMode=2 渲染） */
export function PortfolioLabel({ label, colorIdx }: { label: string; colorIdx: number }) {
  return (
    <div
      style={{
        fontWeight: 600,
        fontSize: 15,
        color: CHART_COLORS[colorIdx],
        marginBottom: 12,
        marginTop: 8,
      }}
    >
      {label}
    </div>
  );
}

/** 错误态卡片 */
export function McErrorState({ error }: { error: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="bt-results-card card"
      style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
    >
      {t('monteCarlo.results.simFailed')}: {error}
    </div>
  );
}

/** 空态卡片（尚未运行模拟） */
export function McEmptyState() {
  const { t } = useTranslation();
  return (
    <div
      className="bt-results-card card"
      style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}
    >
      {t('monteCarlo.results.noResultsHint')}
    </div>
  );
}
