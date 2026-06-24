/**
 * @file 回测页面
 * @description 平台核心页面，提供投资组合回测参数配置、执行及结果可视化展示，包含增长曲线、回撤、统计指标等多种图表
 * @route /
 */
import { useEffect, lazy, Suspense, useState, useMemo, Fragment, memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { Play, Loader2, Save, FolderOpen, Trash2, X, Share2 } from 'lucide-react';
import {
  saveNamedConfig,
  loadNamedConfigs,
  deleteNamedConfig,
  type SavedPortfolio,
} from '@/utils/portfolioStorage';
import { readStateFromURL, writeStateToURL } from '@/utils/urlState';
import ParameterPanel from '@/components/ParameterPanel';
import PortfolioEditor from '@/components/PortfolioEditor';
import GrowthChart from '@/components/charts/GrowthChart';
import DrawdownChart from '@/components/charts/DrawdownChart';
import StatisticsTable from '@/components/StatisticsTable';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

const TelltaleChart = lazy(() => import('@/components/charts/TelltaleChart'));
const RiskReturnScatter = lazy(() => import('@/components/charts/RiskReturnScatter'));
const SeasonalityChart = lazy(() => import('@/components/charts/SeasonalityChart'));
const RegressionChart = lazy(() => import('@/components/charts/RegressionChart'));
const PortfolioAllocationChart = lazy(() => import('@/components/charts/PortfolioAllocationChart'));
const PortfolioPiesChart = lazy(() => import('@/components/charts/PortfolioPiesChart'));
const RollingReturnChart = lazy(() => import('@/components/charts/RollingReturnChart'));
const AnnualReturnChart = lazy(() => import('@/components/charts/AnnualReturnChart'));
const MonthlyReturnHeatmap = lazy(() => import('@/components/charts/MonthlyReturnHeatmap'));
const CorrelationWithBeta = lazy(() => import('@/components/charts/CorrelationMatrix'));
const CustomMetricsTable = lazy(() => import('@/components/CustomMetricsTable'));
const DrawdownEpisodes = lazy(() => import('@/components/DrawdownEpisodes'));
const RebalancingStats = lazy(() => import('@/components/RebalancingStats'));
const CashflowsLog = lazy(() => import('@/components/CashflowsLog'));
const TurnoverTaxReport = lazy(() => import('@/components/TurnoverTaxReport'));
import type { Portfolio, BacktestParameters, PortfolioResult, Statistics } from '../../shared/types';
import { CHART_COLORS } from '../../shared/types';

const TAB_GROUP_KEYS = [
  {
    groupKey: 'tabs.summary',
    tabs: [
      { key: 'summary', labelKey: 'tabs.summary' },
    ],
  },
  {
    groupKey: 'tabs.returns',
    tabs: [
      { key: 'metrics', labelKey: 'tabs.metrics' },
      { key: 'myMetrics', labelKey: 'tabs.myMetrics' },
      { key: 'returns', labelKey: 'tabs.returnsDist' },
      { key: 'rolling', labelKey: 'tabs.rolling' },
      { key: 'seasonality', labelKey: 'tabs.seasonality' },
      { key: 'riskReturn', labelKey: 'tabs.riskReturn' },
    ],
  },
  {
    groupKey: 'tabs.events',
    tabs: [
      { key: 'withdrawal', labelKey: 'tabs.withdrawal' },
      { key: 'cashflows', labelKey: 'tabs.cashflows' },
      { key: 'rebalancing', labelKey: 'tabs.rebalancing' },
      { key: 'turnover', labelKey: 'tabs.turnover' },
    ],
  },
  {
    groupKey: 'tabs.allocation',
    tabs: [
      { key: 'allocation', labelKey: 'tabs.portfolioAllocation' },
      { key: 'pies', labelKey: 'tabs.pies' },
      { key: 'correlation', labelKey: 'tabs.correlation' },
    ],
  },
  {
    groupKey: 'tabs.signalsStatus',
    tabs: [
      { key: 'telltale', labelKey: 'tabs.telltale' },
      { key: 'regression', labelKey: 'tabs.regression' },
    ],
  },
];

/** 提款率成功率表使用的提款率（小数形式） */
const WITHDRAWAL_RATES = [0.03, 0.035, 0.04, 0.045, 0.05];
/** 提款率成功率表使用的退休年限 */
const WITHDRAWAL_HORIZONS = [20, 25, 30];

function formatPct(v: number | undefined | null): string {
  if (v == null) return '\u2014';
  return `${(v * 100).toFixed(2)}%`;
}

function formatRatio(v: number | undefined | null): string {
  if (v == null) return '\u2014';
  return v.toFixed(2);
}

function QuickStatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: '1 1 140px',
      minWidth: 120,
      padding: '12px 16px',
      background: 'var(--bg-subtle)',
      borderRadius: 'var(--radius-control)',
      border: '1px solid var(--border-soft)',
    }}>
      <div className="text-[11px] font-medium" style={{ color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div className="text-[18px] font-bold font-mono" style={{ color: color || 'var(--text-strong)' }}>
        {value}
      </div>
    </div>
  );
}

function SummaryQuickStats({ portfolios }: { portfolios: PortfolioResult[] }) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
      {portfolios.map((p, idx) => {
        const s = p.statistics;
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return (
          <div key={p.name} style={{ flex: '1 1 280px', minWidth: 260 }}>
            <div className="text-[12px] font-semibold mb-2" style={{ color }}>
              {p.name}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <QuickStatCard label={t('backtest.cagr')} value={formatPct(s.cagr)} color={s.cagr != null && s.cagr >= 0 ? 'var(--success)' : 'var(--danger)'} />
              <QuickStatCard label={t('backtest.maxDrawdown')} value={formatPct(s.maxDrawdown)} color="var(--danger)" />
              <QuickStatCard label={t('backtest.sharpeRatio')} value={formatRatio(s.sharpe)} color={s.sharpe != null && s.sharpe >= 0 ? 'var(--success)' : 'var(--danger)'} />
              <QuickStatCard label={t('backtest.swr30y')} value={s.swr30y != null ? formatPct(s.swr30y) : '\u2014'} color="var(--brand)" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KeyStatsSummary({ portfolios }: { portfolios: PortfolioResult[] }) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return null;

  const rows = [
    { key: 'cagr' as const, label: t('backtest.cagr') },
    { key: 'mwrr' as const, label: t('backtest.mwrr') },
    { key: 'stdev' as const, label: t('backtest.stdev') },
    { key: 'sharpe' as const, label: t('backtest.sharpeRatio') },
    { key: 'sortino' as const, label: t('backtest.sortino') },
    { key: 'maxDrawdown' as const, label: t('backtest.maxDrawdown') },
    { key: 'calmar' as const, label: t('backtest.calmar') },
    { key: 'pctPositiveYears' as const, label: t('backtest.pctPositiveYears') },
  ];

  const hasAny = rows.some(r => portfolios.some(p => p.statistics[r.key] != null));
  if (!hasAny) return null;

  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('backtest.keyStatsSummary')}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                {t('common.metric')}
              </th>
              {portfolios.map((p, idx) => (
                <th key={p.name} className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const hasVal = portfolios.some(p => p.statistics[row.key] != null);
              if (!hasVal) return null;
              const isPct = ['cagr', 'mwrr', 'stdev', 'maxDrawdown', 'pctPositiveYears'].includes(row.key);
              return (
                <tr key={row.key} style={{ backgroundColor: rowIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                  <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                    {row.label}
                  </td>
                  {portfolios.map((p) => {
                    const val = p.statistics[row.key];
                    return (
                      <td key={p.name} className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                        {val != null ? (isPct ? formatPct(val) : formatRatio(val)) : '\u2014'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function computeSurvivalAndPreservation(
  growthCurve: Array<{ date: string; value: number }>,
  startValue: number
): { survival: Array<{ years: number; rate: number }>; preservation: Array<{ years: number; rate: number }> } {
  const survival: Array<{ years: number; rate: number }> = [];
  const preservation: Array<{ years: number; rate: number }> = [];

  const targetYears = [5, 10, 15, 20, 25, 30, 35, 40];
  const startDate = new Date(growthCurve[0]?.date);
  if (!startDate || isNaN(startDate.getTime())) return { survival, preservation };

  // 预计算时间戳数组，用于二分搜索
  const timestamps = growthCurve.map(p => new Date(p.date).getTime());

  for (const y of targetYears) {
    const targetDate = new Date(startDate);
    targetDate.setFullYear(targetDate.getFullYear() + y);

    let survivedCount = 0;
    let preservedCount = 0;
    let totalPaths = 0;

    for (let startIdx = 0; startIdx < growthCurve.length; startIdx++) {
      const eTime = timestamps[startIdx] + y * 365.25 * 24 * 3600 * 1000;

      // 二分搜索：找到第一个时间戳 >= eTime 的索引
      let lo = startIdx + 1, hi = timestamps.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (timestamps[mid] < eTime) lo = mid + 1;
        else hi = mid;
      }
      const endIdx = lo < timestamps.length ? lo : -1;

      if (endIdx > 0) {
        totalPaths++;
        const endValue = growthCurve[endIdx].value;
        if (endValue > 0) survivedCount++;
        if (endValue >= startValue) preservedCount++;
      }
    }

    if (totalPaths > 0) {
      survival.push({ years: y, rate: +(survivedCount / totalPaths).toFixed(4) });
      preservation.push({ years: y, rate: +(preservedCount / totalPaths).toFixed(4) });
    }
  }

  return { survival, preservation };
}

/**
 * 计算不同提款率下的成功率（前端滚动窗口模拟）。
 *
 * 对每个年度起始点（退休队列），模拟在 horizon 年内每年提取 rate 比例的初始资金，
 * 若期末组合价值仍 > 0 则记为成功。成功率为所有可行起始点的成功比例。
 *
 * @param growthCurve 组合增长曲线
 * @param rates 提款率数组（小数形式，如 0.04 表示 4%）
 * @param horizons 退休年限数组，如 [20, 25, 30]
 * @returns 每个提款率对应各年限的成功率（小数形式）
 */
function computeWithdrawalSuccessRates(
  growthCurve: Array<{ date: string; value: number }>,
  rates: number[],
  horizons: number[],
): Array<{ rate: number; [key: string]: number }> {
  if (growthCurve.length < 2) return [];
  const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;
  const pts = growthCurve.map((g) => ({ v: g.value, t: new Date(g.date).getTime() }));

  // 按年采样起始点（每个年度取首个数据点作为退休队列起点）
  const startIndices: number[] = [];
  let lastStartYear = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const y = new Date(pts[i].t).getFullYear();
    if (y > lastStartYear) {
      startIndices.push(i);
      lastStartYear = y;
    }
  }

  const results: Array<{ rate: number; [key: string]: number }> = [];
  for (const rate of rates) {
    const row: { rate: number; [key: string]: number } = { rate };
    for (const horizon of horizons) {
      let successes = 0;
      let total = 0;
      for (const i of startIndices) {
        const startVal = pts[i].v;
        if (startVal <= 0) continue;
        // 定位 horizon 内每个年度边界索引（二分搜索）
        const startTime = pts[i].t;
        const boundaryIdx: number[] = [];
        let searchFrom = i + 1;
        for (let y = 1; y <= horizon; y++) {
          const targetT = startTime + y * MS_PER_YEAR;
          // 二分搜索：在 [searchFrom, pts.length) 中找第一个 pts[k].t >= targetT
          let lo = searchFrom, hi = pts.length;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (pts[mid].t < targetT) lo = mid + 1;
            else hi = mid;
          }
          if (lo >= pts.length) break;
          boundaryIdx.push(lo);
          searchFrom = lo + 1;
        }
        if (boundaryIdx.length < horizon) continue; // 数据不足该年限

        // 模拟：每年先按市场增长，再扣除定额提款（rate × 初始值）
        let value = 1.0;
        let survived = true;
        let prevActual = startVal;
        for (let y = 0; y < horizon; y++) {
          const curActual = pts[boundaryIdx[y]].v;
          const mult = curActual / prevActual;
          value *= mult;
          value -= rate;
          if (value <= 0) { survived = false; break; }
          prevActual = curActual;
        }
        total++;
        if (survived) successes++;
      }
      row[`h${horizon}`] = total > 0 ? successes / total : 0;
    }
    results.push(row);
  }
  return results;
}

function WithdrawalTab({ portfolios }: { portfolios: PortfolioResult[] }) {
  const { t } = useTranslation();
  const pfList = portfolios;

  const withdrawalCurveData = useMemo(() => {
    if (pfList.length === 0) return [];
    const years = [5, 10, 15, 20, 25, 30, 35, 40];
    const knownYears = [10, 20, 30, 40];
    const swrKeys: Record<number, keyof Statistics> = { 10: 'swr10y', 20: 'swr20y', 30: 'swr30y', 40: 'swr40y' };
    const pwrKeys: Record<number, keyof Statistics> = { 10: 'pwr10y', 20: 'pwr20y', 30: 'pwr30y', 40: 'pwr40y' };

    const getInterpolated = (keyMap: Record<number, keyof Statistics>, year: number) => {
      const knownPoints = knownYears
        .map(y => ({ year: y, val: pfList[0]?.statistics[keyMap[y]] as number | undefined }))
        .filter(p => p.val != null);
      if (knownPoints.length === 0) return null;
      if (knownPoints.length === 1) return knownPoints[0].val as number;
      if (year <= knownPoints[0].year) return knownPoints[0].val as number;
      if (year >= knownPoints[knownPoints.length - 1].year) return knownPoints[knownPoints.length - 1].val as number;
      for (let i = 0; i < knownPoints.length - 1; i++) {
        if (year >= knownPoints[i].year && year <= knownPoints[i + 1].year) {
          const t = (year - knownPoints[i].year) / (knownPoints[i + 1].year - knownPoints[i].year);
          return (knownPoints[i].val as number) * (1 - t) + (knownPoints[i + 1].val as number) * t;
        }
      }
      return null;
    };

    const hasAnySwr = pfList.some(p => p.statistics.swr10y != null || p.statistics.swr20y != null);
    if (!hasAnySwr) return [];

    return years.map(y => ({
      years: y,
      swr: getInterpolated(swrKeys, y),
      pwr: getInterpolated(pwrKeys, y),
    }));
  }, [pfList]);

  const survivalData = useMemo(() => {
    if (pfList.length === 0) return [];
    const startValue = 10000;
    return pfList.map(p => {
      const { survival, preservation } = computeSurvivalAndPreservation(p.growthCurve, startValue);
      return { name: p.name, survival, preservation };
    });
  }, [pfList]);

  const mergedSurvivalCurve = useMemo(() => {
    if (survivalData.length === 0) return [];
    const yearMap = new Map<number, Record<string, number | string>>();
    for (const sd of survivalData) {
      for (const pt of sd.survival) {
        if (!yearMap.has(pt.years)) {
          yearMap.set(pt.years, { years: pt.years });
        }
        yearMap.get(pt.years)![sd.name + '_survival'] = +(pt.rate * 100).toFixed(1);
      }
      for (const pt of sd.preservation) {
        if (!yearMap.has(pt.years)) {
          yearMap.set(pt.years, { years: pt.years });
        }
        yearMap.get(pt.years)![sd.name + '_preservation'] = +(pt.rate * 100).toFixed(1);
      }
    }
    return Array.from(yearMap.values()).sort((a, b) => (a.years as number) - (b.years as number));
  }, [survivalData]);

  const hasSurvivalData = mergedSurvivalCurve.length > 0;

  // 不同提款率（3%-5%）下的成功率，按组合计算
  const successRateByPortfolio = useMemo(() => {
    return pfList.map((p) => ({
      name: p.name,
      rates: computeWithdrawalSuccessRates(p.growthCurve, WITHDRAWAL_RATES, WITHDRAWAL_HORIZONS),
    }));
  }, [pfList]);
  const hasSuccessRateData = successRateByPortfolio.some((s) => s.rates.length > 0);

  return (
    <>
      {withdrawalCurveData.length > 0 && (
        <div className="chart-card">
          <div className="chart-card-title">{t('backtest.withdrawalCurve')}</div>
          <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('backtest.swrPwrDesc')}
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={withdrawalCurveData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
              <XAxis
                dataKey="years"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                label={{ value: t('backtest.retirementYears'), position: 'insideBottom', offset: -5, style: { fill: 'var(--text-muted)', fontSize: 12 } }}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                label={{ value: t('backtest.withdrawalRate'), angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-control)',
                  color: 'var(--text-body)',
                  fontSize: '12px',
                  boxShadow: 'var(--shadow-md)',
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: string) => {
                  if (value == null) return ['\u2014', name];
                  const label = name === 'swr' ? 'SWR' : 'PWR';
                  return [`${(value * 100).toFixed(2)}%`, label];
                }}
                labelFormatter={(label: number) => `${label}${t('common.years')}`}
              />
              <Legend formatter={(value: string) => value === 'swr' ? t('backtest.swrSafe') : t('backtest.pwrPerpetual')} wrapperStyle={{ fontSize: '12px' }} />
              <Line type="monotone" dataKey="swr" stroke="#2b63b8" strokeWidth={2} dot={{ r: 4 }} name="swr" />
              <Line type="monotone" dataKey="pwr" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} name="pwr" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasSurvivalData && (
        <div className="chart-card">
          <div className="chart-card-title">{t('backtest.survivalPreservation')}</div>
          <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('backtest.survivalDesc')}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mergedSurvivalCurve} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
              <XAxis
                dataKey="years"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                label={{ value: t('backtest.holdingYears'), position: 'insideBottom', offset: -5, style: { fill: 'var(--text-muted)', fontSize: 12 } }}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-control)',
                  color: 'var(--text-body)',
                  fontSize: '12px',
                  boxShadow: 'var(--shadow-md)',
                }}
                formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                labelFormatter={(label: number) => `${label}${t('common.years')}`}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {survivalData.map((sd, idx) => {
                const color = CHART_COLORS[idx % CHART_COLORS.length];
                return [
                  <Line key={`${sd.name}_surv`} type="monotone" dataKey={`${sd.name}_survival`} stroke={color} strokeWidth={2} dot={{ r: 3 }} name={`${sd.name} ${t('backtest.survivalRate')}`} />,
                  <Line key={`${sd.name}_pres`} type="monotone" dataKey={`${sd.name}_preservation`} stroke={color} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name={`${sd.name} ${t('backtest.preservationRate')}`} />,
                ];
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasSurvivalData && (
        <div className="chart-card">
          <div className="chart-card-title">{t('backtest.survivalPreservationDetail')}</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                  <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    {t('common.metric')}
                  </th>
                  {pfList.map((p, idx) => (
                    <th key={p.name} className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {survivalData.map((sd, sIdx) => {
                  const rows: Array<{ label: string; type: 'survival' | 'preservation'; years: number; val: string }> = [];
                  for (const pt of sd.survival) {
                    rows.push({ label: `${pt.years}${t('common.years')}${t('backtest.survivalRate')}`, type: 'survival', years: pt.years, val: `${(pt.rate * 100).toFixed(1)}%` });
                  }
                  for (const pt of sd.preservation) {
                    rows.push({ label: `${pt.years}${t('common.years')}${t('backtest.preservationRate')}`, type: 'preservation', years: pt.years, val: `${(pt.rate * 100).toFixed(1)}%` });
                  }
                  if (rows.length === 0) return null;
                  return (
                    <Fragment key={sd.name}>
                      <tr style={{ backgroundColor: 'var(--bg-strong)' }}>
                        <td
                          colSpan={1 + pfList.length}
                          className="text-[12px] font-bold py-2 px-3"
                          style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}
                        >
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: CHART_COLORS[sIdx % CHART_COLORS.length] }}
                          />
                          {sd.name}
                        </td>
                      </tr>
                      {rows.map((row, rIdx) => (
                        <tr key={row.label} style={{ backgroundColor: rIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                          <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                            {row.label}
                          </td>
                          {pfList.map((p) => {
                            const targetSd = survivalData.find(s => s.name === p.name);
                            if (!targetSd) return (
                              <td key={p.name} className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                                {'\u2014'}
                              </td>
                            );
                            const year = row.years;
                            const isSurvival = row.type === 'survival';
                            const dataArr = isSurvival ? targetSd.survival : targetSd.preservation;
                            const pt = dataArr.find(d => d.years === year);
                            return (
                              <td key={p.name} className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                                {pt ? `${(pt.rate * 100).toFixed(1)}%` : '\u2014'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="chart-card">
        <div className="chart-card-title">{t('backtest.withdrawalStats')}</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                  {t('common.metric')}
                </th>
                {pfList.map((p, idx) => (
                  <th key={p.name} className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                      style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                    />
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'swr10y' as const, label: t('backtest.safeWR') },
                { key: 'pwr10y' as const, label: t('backtest.perpetualWR') },
                { key: 'swr20y' as const, label: t('backtest.safeWR') },
                { key: 'pwr20y' as const, label: t('backtest.perpetualWR') },
                { key: 'swr30y' as const, label: t('backtest.safeWR') },
                { key: 'pwr30y' as const, label: t('backtest.perpetualWR') },
                { key: 'swr40y' as const, label: t('backtest.safeWR') },
                { key: 'pwr40y' as const, label: t('backtest.perpetualWR') },
              ].map((row, rowIdx) => {
                const hasAnyValue = pfList.some(
                  (p) => p.statistics[row.key] !== undefined && p.statistics[row.key] !== null
                );
                if (!hasAnyValue) return null;
                return (
                  <tr key={row.key} style={{ backgroundColor: rowIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                      {row.label}
                    </td>
                    {pfList.map((p) => {
                      const val = p.statistics[row.key];
                      return (
                        <td key={p.name} className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                          {val !== undefined && val !== null ? `${(val * 100).toFixed(2)}%` : '\u2014'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {hasSuccessRateData && (
        <div className="chart-card">
          <div className="chart-card-title">{t('backtest.withdrawalSuccessRate')}</div>
          <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('backtest.withdrawalSuccessDesc')}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                  <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    {t('backtest.portfolio')}
                  </th>
                  <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                    {t('backtest.withdrawalRateLabel')}
                  </th>
                  {WITHDRAWAL_HORIZONS.map((h) => (
                    <th key={h} className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                      {h}{t('common.years')}{t('backtest.successRateYears')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {successRateByPortfolio.map((sp, sIdx) => {
                  if (sp.rates.length === 0) return null;
                  const color = CHART_COLORS[sIdx % CHART_COLORS.length];
                  return (
                    <Fragment key={sp.name}>
                      {sp.rates.map((row, rIdx) => (
                        <tr key={`${sp.name}-${row.rate}`} style={{ backgroundColor: rIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                          <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                            {rIdx === 0 && (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                {sp.name}
                              </span>
                            )}
                          </td>
                          <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                            {(row.rate * 100).toFixed(1)}%
                          </td>
                          {WITHDRAWAL_HORIZONS.map((h) => {
                            const v = row[`h${h}`] as number;
                            const pct = v != null ? v * 100 : 0;
                            const cellColor = pct >= 90 ? 'var(--success)' : pct >= 70 ? 'var(--brand)' : pct >= 50 ? '#f59e0b' : 'var(--danger)';
                            return (
                              <td key={h} className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: cellColor, borderBottom: '1px solid var(--border-soft)' }}>
                                {v != null ? `${pct.toFixed(1)}%` : '\u2014'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

const ReturnsTab = memo(function ReturnsTab({ portfolios }: { portfolios: PortfolioResult[] }) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<'annual' | 'monthly' | 'daily'>('annual');

  const dailyReturnChartData = useMemo(() => {
    if (portfolios.length === 0) return { bins: [], stats: [] };
    const allBins: Array<{ range: string; [portfolioName: string]: string | number }> = [];
    const statsList: Array<{ name: string; avgReturn: string; stdev: string; skewness: string; kurtosis: string; pctPositive: string }> = [];

    const portfolioDailyData: Array<{ name: string; returns: number[]; binCounts: Map<string, number> }> = [];

    const binEdges: number[] = [];
    const binStep = 0.005;
    for (let b = -0.10; b <= 0.10; b += binStep) {
      binEdges.push(+b.toFixed(4));
    }
    binEdges.push(+(0.10 + binStep).toFixed(4));

    const binLabels: string[] = [];
    for (let i = 0; i < binEdges.length - 1; i++) {
      binLabels.push(`${(binEdges[i] * 100).toFixed(1)}%`);
    }

    for (const p of portfolios) {
      const returns: number[] = [];
      for (let i = 1; i < p.growthCurve.length; i++) {
        if (p.growthCurve[i - 1].value > 0) {
          returns.push((p.growthCurve[i].value - p.growthCurve[i - 1].value) / p.growthCurve[i - 1].value);
        }
      }

      const counts = new Map<string, number>();
      for (const label of binLabels) counts.set(label, 0);
      for (const r of returns) {
        let placed = false;
        for (let i = 0; i < binEdges.length - 1; i++) {
          if (r >= binEdges[i] && r < binEdges[i + 1]) {
            counts.set(binLabels[i], (counts.get(binLabels[i]) || 0) + 1);
            placed = true;
            break;
          }
        }
        if (!placed) {
          const lastLabel = binLabels[binLabels.length - 1];
          counts.set(lastLabel, (counts.get(lastLabel) || 0) + 1);
        }
      }

      portfolioDailyData.push({ name: p.name, returns, binCounts: counts });

      const n = returns.length;
      if (n > 1) {
        const mean = returns.reduce((s, v) => s + v, 0) / n;
        const std = Math.sqrt(returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
        const m3 = returns.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
        const m4 = returns.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
        const skewness = std > 0 ? (m3 / std ** 3) * Math.sqrt(n * (n - 1)) / (n - 2) : 0;
        const kurtosis = std > 0 ? m4 / std ** 4 - 3 : 0;
        const pctPositive = returns.filter(r => r > 0).length / n;

        statsList.push({
          name: p.name,
          avgReturn: `${(mean * 100).toFixed(4)}%`,
          stdev: `${(std * 100).toFixed(4)}%`,
          skewness: skewness.toFixed(3),
          kurtosis: kurtosis.toFixed(3),
          pctPositive: `${(pctPositive * 100).toFixed(2)}%`,
        });
      }
    }

    for (let i = 0; i < binLabels.length; i++) {
      const row: { range: string; [k: string]: string | number } = { range: binLabels[i] };
      for (const pd of portfolioDailyData) {
        row[pd.name] = pd.binCounts.get(binLabels[i]) || 0;
      }
      allBins.push(row);
    }

    return { bins: allBins, stats: statsList };
  }, [portfolios]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-soft)', marginBottom: 16 }}>
        {[
          { key: 'annual' as const, label: t('tabs.annualReturns') },
          { key: 'monthly' as const, label: t('tabs.monthlyReturns') },
          { key: 'daily' as const, label: t('tabs.dailyReturns') },
        ].map(st => (
          <button
            key={st.key}
            onClick={() => setSubTab(st.key)}
            style={{
              padding: '0 16px',
              minHeight: 36,
              fontSize: 13,
              fontWeight: 500,
              color: subTab === st.key ? 'var(--brand)' : 'var(--text-muted)',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              position: 'relative',
              textTransform: 'uppercase',
            }}
          >
            {st.label}
            {subTab === st.key && (
              <span style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 2,
                background: 'var(--brand)',
              }} />
            )}
          </button>
        ))}
      </div>

      {subTab === 'annual' && (
        <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
          <AnnualReturnChart portfolios={portfolios} />
        </Suspense>
      )}

      {subTab === 'monthly' && (
        <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
          <div>{portfolios.map((p) => <MonthlyReturnHeatmap key={p.name} portfolio={p} />)}</div>
        </Suspense>
      )}

      {subTab === 'daily' && (
        <div>
          {dailyReturnChartData.bins.length > 0 && (
            <div className="chart-card">
              <div className="chart-card-title">{t('backtest.dailyReturnsHist')}</div>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={dailyReturnChartData.bins} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis
                    dataKey="range"
                    tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    label={{ value: t('backtest.frequency'), angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-control)',
                      color: 'var(--text-body)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  {portfolios.map((p, idx) => (
                    <Bar
                      key={p.name}
                      dataKey={p.name}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      fillOpacity={0.7}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {dailyReturnChartData.stats.length > 0 && (
            <div className="chart-card">
              <div className="chart-card-title">{t('backtest.dailyReturnsStats')}</div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                      <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        {t('backtest.portfolio')}
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        {t('backtest.dailyAvgReturn')}
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        {t('backtest.standardDeviation')}
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        {t('backtest.skewness')}
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        {t('backtest.excessKurtosis')}
                      </th>
                      <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                        {t('backtest.positiveReturnPct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyReturnChartData.stats.map((row, idx) => (
                      <tr key={row.name} style={{ backgroundColor: idx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}>
                        <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                          />
                          {row.name}
                        </td>
                        <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                          {row.avgReturn}
                        </td>
                        <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                          {row.stdev}
                        </td>
                        <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                          {row.skewness}
                        </td>
                        <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                          {row.kurtosis}
                        </td>
                        <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                          {row.pctPositive}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default function BacktestPage() {
  const { t } = useTranslation();
  const results = useBacktestStore(s => s.results);
  const isLoading = useBacktestStore(s => s.isLoading);
  const activeTab = useBacktestStore(s => s.activeTab);
  const setActiveTab = useBacktestStore(s => s.setActiveTab);
  const runBacktest = useBacktestStore(s => s.runBacktest);
  const loadFromShare = useBacktestStore(s => s.loadFromShare);
  const hasLoadedFromShare = useBacktestStore(s => s.hasLoadedFromShare);
  const setHasLoadedFromShare = useBacktestStore(s => s.setHasLoadedFromShare);
  const parameters = useBacktestStore(s => s.parameters);
  const portfolios = useBacktestStore(s => s.portfolios);

  const pfList = useMemo(() => results?.portfolios ?? [], [results]);

  const [showSaveInput, setShowSaveInput] = useState(false);
  const [configName, setConfigName] = useState('');
  const [showLoadList, setShowLoadList] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<SavedPortfolio[]>([]);

  const handleSaveConfig = () => {
    const name = configName.trim();
    if (!name) return;
    saveNamedConfig(name, portfolios, parameters);
    useToastStore.getState().addToast('success', t('backtest.savedScheme'));
    setConfigName('');
    setShowSaveInput(false);
  };

  const handleOpenLoadList = () => {
    setSavedConfigs(loadNamedConfigs());
    setShowLoadList((v) => !v);
    setShowSaveInput(false);
  };

  const handleLoadConfig = (config: SavedPortfolio) => {
    loadFromShare({ portfolios: config.portfolios, parameters: config.parameters });
    useToastStore.getState().addToast('success', t('backtest.loadedScheme'));
    setShowLoadList(false);
  };

  const handleDeleteConfig = (id: string) => {
    deleteNamedConfig(id);
    setSavedConfigs(loadNamedConfigs());
  };

  const handleShareLink = async () => {
    const state = useBacktestStore.getState().getShareableState();
    const url = writeStateToURL(state);
    try {
      await navigator.clipboard.writeText(url);
      useToastStore.getState().addToast('success', t('backtest.shareLinkCopied'));
    } catch {
      useToastStore.getState().addToast('success', t('backtest.shareLinkManual'));
    }
  };

  useEffect(() => {
    if (hasLoadedFromShare) return;
    setHasLoadedFromShare(true);

    // 1. 优先检查 URL ?d= 参数（testfol.io 风格分享链接）
    const urlState = readStateFromURL();
    if (urlState) {
      loadFromShare(urlState);
      useToastStore.getState().addToast('success', t('backtest.loadedFromShare'));
      return;
    }

    const loadFromOptimizer = localStorage.getItem('bt_load_from_optimizer');
    if (loadFromOptimizer) {
      localStorage.removeItem('bt_load_from_optimizer'); // 先删除，防止残留
      try {
        const data = JSON.parse(loadFromOptimizer);
        const sharePortfolios: Portfolio[] = (data.portfolios || []).map((p: Portfolio) => ({
          ...p,
          id: p.id || `portfolio-${Date.now()}`,
        }));
        const shareParameters: BacktestParameters = data.parameters;
        if (sharePortfolios.length > 0 && shareParameters) {
          loadFromShare({ portfolios: sharePortfolios, parameters: shareParameters });
        }
      } catch {
        useToastStore.getState().addToast('warning', t('backtest.optimizerDataError'));
      }
    }

    const hash = window.location.hash;
    if (hash.startsWith('#share=')) {
      try {
        const encoded = hash.slice(7);
        const json = decodeURIComponent(atob(encoded));
        const data = JSON.parse(json);
        const sharePortfolios: Portfolio[] = (data.p || []).map((p: Portfolio) => ({
          ...p,
          id: p.id || `portfolio-${Date.now()}`,
        }));
        const shareParameters: BacktestParameters = data.params;
        if (sharePortfolios.length > 0 && shareParameters) {
          loadFromShare({ portfolios: sharePortfolios, parameters: shareParameters });
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch {
        useToastStore.getState().addToast('warning', t('backtest.shareDataError'));
      }
    }
  }, [loadFromShare, hasLoadedFromShare, setHasLoadedFromShare]);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('backtest.title')}</h1>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          {t('backtest.seoDesc')}
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">{t('backtest.seoModelable')}</div>
            <div className="bt-seo-feature-desc">{t('backtest.seoModelableDesc')}</div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">{t('backtest.seoViewable')}</div>
            <div className="bt-seo-feature-desc">{t('backtest.seoViewableDesc')}</div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">{t('backtest.relatedTools')}</span>
          <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.monteCarlo')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.portfolioOptimize')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.efficientFrontier')}</Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>{t('nav.assetAnalysis')}</Link>
        </div>
      </div>

      <div className="bt-main-card card bt-layout">
        <div className="bt-layout-left">
          <ParameterPanel />
          <PortfolioEditor />
          <div className="bt-action-row">
            <button
              onClick={runBacktest}
              disabled={isLoading}
              className="main-action-btn"
              style={{ width: '100%' }}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isLoading ? t('backtest.running') : t('backtest.runButton')}
            </button>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => { setShowSaveInput((v) => !v); setShowLoadList(false); }}
                className="toolbar-btn"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <Save className="w-3.5 h-3.5" />
                {t('backtest.savePortfolio')}
              </button>
              <button
                onClick={handleOpenLoadList}
                className="toolbar-btn"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {t('backtest.loadPortfolio')}
              </button>
              <button
                onClick={handleShareLink}
                className="toolbar-btn"
                title={t('backtest.shareLink')}
                style={{ justifyContent: 'center' }}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {showSaveInput && (
              <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveConfig(); }}
                  placeholder={t('backtest.configNamePlaceholder')}
                  className="param-input"
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button onClick={handleSaveConfig} className="toolbar-btn">{t('common.confirm')}</button>
                <button
                  onClick={() => { setShowSaveInput(false); setConfigName(''); }}
                  className="row-remove-btn"
                  title={t('common.cancel')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {showLoadList && (
              <div
                style={{
                  marginTop: '8px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--bg-subtle)',
                }}
              >
                {savedConfigs.length === 0 ? (
                  <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
                    {t('backtest.noSavedSchemes')}
                  </div>
                ) : (
                  savedConfigs.map((config) => (
                    <div
                      key={config.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 10px',
                        borderBottom: '1px solid var(--border-soft)',
                      }}
                    >
                      <button
                        onClick={() => handleLoadConfig(config)}
                        style={{
                          flex: 1,
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-body)',
                          fontSize: '13px',
                          padding: 0,
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{config.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(config.savedAt).toLocaleString('zh-CN')} · {config.portfolios.length} {t('backtest.portfoliosCount')}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteConfig(config.id)}
                        className="row-remove-btn"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bt-layout-right">
          {results ? (
            <>
              <div className="result-tabs">
                {TAB_GROUP_KEYS.map((group) => (
                  <div key={t(group.groupKey)} className="result-tab-group">
                    <span className="result-tab-group-label">{t(group.groupKey)}</span>
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
                      >
                        {t(tab.labelKey)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="result-content">
                {activeTab === 'summary' && (
                  <>
                    <SummaryQuickStats portfolios={pfList} />
                    <div className="chart-card">
                      <div className="chart-card-title">{t('backtest.growth')}</div>
                      <GrowthChart portfolios={pfList} baseCurrency={parameters.baseCurrency} />
                    </div>
                    <div className="chart-card">
                      <div className="chart-card-title">{t('backtest.drawdown')}</div>
                      <DrawdownChart portfolios={pfList} />
                    </div>
                    <KeyStatsSummary portfolios={pfList} />
                    <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                      <DrawdownEpisodes portfolios={pfList} />
                    </Suspense>
                  </>
                )}

                {activeTab === 'metrics' && <StatisticsTable portfolios={pfList} />}

                {activeTab === 'myMetrics' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <CustomMetricsTable portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'telltale' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <TelltaleChart portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'withdrawal' && <WithdrawalTab portfolios={pfList} />}

                {activeTab === 'rolling' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <RollingReturnChart portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'regression' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <RegressionChart portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'riskReturn' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <RiskReturnScatter portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'seasonality' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <SeasonalityChart portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'returns' && <ReturnsTab portfolios={pfList} />}

                {activeTab === 'correlation' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <CorrelationWithBeta
                      portfolios={pfList}
                      assetTickers={results.assetTickers}
                      assetCorrelations={results.assetCorrelations}
                      portfolioCorrelations={results.correlations}
                    />
                  </Suspense>
                )}

                {activeTab === 'rebalancing' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <RebalancingStats portfolios={portfolios} />
                  </Suspense>
                )}

                {activeTab === 'turnover' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <TurnoverTaxReport portfolios={pfList} />
                  </Suspense>
                )}

                {activeTab === 'allocation' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <PortfolioAllocationChart
                      portfolios={(results.portfolios ?? []).map((rp, idx) => ({
                        name: rp.name,
                        assets: portfolios[idx]?.assets ?? [],
                        growthCurve: rp.growthCurve,
                        allocationHistory: rp.allocationHistory,
                      }))}
                    />
                  </Suspense>
                )}

                {activeTab === 'pies' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <PortfolioPiesChart portfolios={portfolios} />
                  </Suspense>
                )}

                {activeTab === 'cashflows' && (
                  <Suspense fallback={<div style={{ color: 'var(--text-muted)', padding: 20 }}>{t('common.loading')}</div>}>
                    <CashflowsLog parameters={parameters} />
                  </Suspense>
                )}
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: '300px',
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}>
              {t('backtest.noResultsHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
