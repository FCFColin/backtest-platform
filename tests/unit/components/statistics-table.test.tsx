import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@backtest/shared', () => ({
  CHART_COLORS: ['#8884d8', '#82ca9d', '#ffc658'],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      return key.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ''));
    },
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

vi.mock('@/utils/format', () => ({
  fmtPct: (v: number) => `${(v * 100).toFixed(2)}%`,
  fmtRatio: (v: number) => v.toFixed(2),
  fmtNum: (v: number, digits = 2) => v.toFixed(digits),
}));

import {
  StatisticsTableHeader,
  MetricsRows,
  StatisticsGroupRows,
  HierarchicalMetricsRows,
  MetricsToggle,
} from '../../../packages/frontend/src/components/statistics-table/index.js';
import type { StatRow, StatGroup } from '../../../packages/frontend/src/components/statistics-table/types.js';

function createPortfolio(name: string, stats: Record<string, number | undefined>) {
  return { name, statistics: stats };
}

const ROWS: StatRow[] = [
  { key: 'cagr', label: 'CAGR', fmt: 'pct', importance: 'primary' },
  { key: 'sharpe', label: '夏普', fmt: 'ratio', importance: 'primary' },
  { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct', importance: 'secondary', higherIsBetter: false },
  { key: 'ulcerIndex', label: 'Ulcer', fmt: 'num', importance: 'detailed' },
];

describe('StatisticsTableHeader', () => {
  it('渲染指标列标题与各组合名称', () => {
    const portfolios = [
      createPortfolio('组合 A', { cagr: 0.08 }),
      createPortfolio('组合 B', { cagr: 0.06 }),
    ];

    const { container } = render(
      <table>
        <thead>
          <StatisticsTableHeader portfolios={portfolios as never} />
        </thead>
      </table>,
    );

    expect(screen.getByText('common.metric')).toBeTruthy();
    expect(screen.getByText('组合 A')).toBeTruthy();
    expect(screen.getByText('组合 B')).toBeTruthy();
    // 颜色圆点渲染
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBe(2);
  });
});

describe('MetricsRows', () => {
  it('渲染各组合的指标值', () => {
    const portfolios = [
      createPortfolio('组合 A', { cagr: 0.08, sharpe: 1.5 }),
      createPortfolio('组合 B', { cagr: 0.06, sharpe: 1.2 }),
    ];

    render(
      <table>
        <tbody>
          <MetricsRows rows={ROWS.slice(0, 2)} portfolios={portfolios as never} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('8.00%')).toBeTruthy();
    expect(screen.getByText('6.00%')).toBeTruthy();
    expect(screen.getByText('1.50')).toBeTruthy();
    expect(screen.getByText('1.20')).toBeTruthy();
  });

  it('跳过所有组合均无值的指标行', () => {
    const portfolios = [createPortfolio('组合 A', { cagr: 0.08 })];

    render(
      <table>
        <tbody>
          <MetricsRows rows={ROWS} portfolios={portfolios as never} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('CAGR')).toBeTruthy();
    // sharpe/maxDrawdown 无值，不应渲染
    expect(screen.queryByText('夏普')).toBeNull();
    expect(screen.queryByText('最大回撤')).toBeNull();
  });

  it('部分组合有值时仍渲染该行，缺值组合显示占位符 —', () => {
    const portfolios = [
      createPortfolio('组合 A', { cagr: 0.08, sharpe: 1.5 }),
      createPortfolio('组合 B', { cagr: 0.06 }),
    ];

    render(
      <table>
        <tbody>
          <MetricsRows rows={ROWS.slice(0, 2)} portfolios={portfolios as never} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('1.50')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBe(1);
  });
});

describe('StatisticsGroupRows', () => {
  it('渲染分组标题与分组下指标行', () => {
    const group: StatGroup = {
      title: 'core.group',
      rows: [{ key: 'cagr', label: 'CAGR', fmt: 'pct' }],
    };
    const portfolios = [createPortfolio('组合 A', { cagr: 0.08 })];

    const { container } = render(
      <table>
        <tbody>
          <StatisticsGroupRows group={group} portfolios={portfolios as never} colCount={3} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('core.group')).toBeTruthy();
    expect(screen.getByText('8.00%')).toBeTruthy();
    // 分组标题行 colSpan=3
    const groupCell = container.querySelector('.stat-table-group-cell');
    expect(groupCell?.getAttribute('colspan')).toBe('3');
  });
});

describe('HierarchicalMetricsRows', () => {
  it('expanded=false 时隐藏 detailed 指标', () => {
    const portfolios = [createPortfolio('组合 A', { cagr: 0.08, ulcerIndex: 2.5 })];

    render(
      <table>
        <tbody>
          <HierarchicalMetricsRows rows={ROWS} portfolios={portfolios as never} expanded={false} />
        </tbody>
      </table>,
    );

    // primary 指标可见
    expect(screen.getByText('CAGR')).toBeTruthy();
    // detailed 指标被隐藏
    expect(screen.queryByText('Ulcer')).toBeNull();
  });

  it('expanded=true 时显示 detailed 指标', () => {
    const portfolios = [createPortfolio('组合 A', { cagr: 0.08, ulcerIndex: 2.5 })];

    render(
      <table>
        <tbody>
          <HierarchicalMetricsRows rows={ROWS} portfolios={portfolios as never} expanded={true} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('CAGR')).toBeTruthy();
    expect(screen.getByText('Ulcer')).toBeTruthy();
    expect(screen.getByText('2.50')).toBeTruthy();
  });
});

describe('MetricsToggle', () => {
  it('collapsed 时显示展开按钮文案', () => {
    render(
      <table>
        <tbody>
          <MetricsToggle expanded={false} onToggle={() => {}} colCount={3} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('results.showDetailedMetrics')).toBeTruthy();
  });

  it('expanded 时显示收起按钮文案', () => {
    render(
      <table>
        <tbody>
          <MetricsToggle expanded={true} onToggle={() => {}} colCount={3} />
        </tbody>
      </table>,
    );

    expect(screen.getByText('results.hideDetailedMetrics')).toBeTruthy();
  });

  it('点击按钮触发 onToggle 回调', () => {
    const onToggle = vi.fn();
    render(
      <table>
        <tbody>
          <MetricsToggle expanded={false} onToggle={onToggle} colCount={3} />
        </tbody>
      </table>,
    );

    screen.getByRole('button').click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
