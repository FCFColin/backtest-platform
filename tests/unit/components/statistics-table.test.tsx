import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@backtest/shared', () => ({
  CHART_COLORS: ['#8884d8', '#82ca9d', '#ffc658'],
}));

vi.mock('react-i18next', async () => (await import('../../helpers/i18nMock.js')).i18nMock);

vi.mock('@/utils/format', () => ({
  fmtPct: (v: number) => `${(v * 100).toFixed(2)}%`,
  fmtRatio: (v: number) => v.toFixed(2),
  fmtNum: (v: number, digits = 2) => v.toFixed(digits),
}));

import { MetricRowsTable } from '../../../packages/frontend/src/components/CustomMetricsTable.js';
import type { StatRow } from '../../../packages/frontend/src/components/statistics-table/types.js';

function createPortfolio(name: string, stats: Record<string, number | undefined>) {
  return { name, statistics: stats };
}

const ROWS: StatRow[] = [
  { key: 'cagr', label: 'CAGR', fmt: 'pct' },
  { key: 'sharpe', label: '夏普', fmt: 'ratio' },
  {
    key: 'maxDrawdown',
    label: '最大回撤',
    fmt: 'pct',
  },
  { key: 'ulcerIndex', label: 'Ulcer', fmt: 'num' },
];

describe('MetricRowsTable', () => {
  it('渲染指标列标题与各组合名称', () => {
    const portfolios = [
      createPortfolio('组合 A', { cagr: 0.08 }),
      createPortfolio('组合 B', { cagr: 0.06 }),
    ];

    const { container } = render(<MetricRowsTable rows={ROWS} portfolios={portfolios as never} />);

    screen.getByText('Metric');
    screen.getByText('组合 A');
    screen.getByText('组合 B');
    const dots = container.querySelectorAll('.rounded-full');
    expect(dots.length).toBe(2);
  });

  it('渲染各组合的指标值', () => {
    const portfolios = [
      createPortfolio('组合 A', { cagr: 0.08, sharpe: 1.5 }),
      createPortfolio('组合 B', { cagr: 0.06, sharpe: 1.2 }),
    ];

    render(<MetricRowsTable rows={ROWS.slice(0, 2)} portfolios={portfolios as never} />);

    screen.getByText('8.00%');
    screen.getByText('6.00%');
    screen.getByText('1.50');
    screen.getByText('1.20');
  });

  it('跳过所有组合均无值的指标行', () => {
    const portfolios = [createPortfolio('组合 A', { cagr: 0.08 })];

    render(<MetricRowsTable rows={ROWS} portfolios={portfolios as never} />);

    screen.getByText('CAGR');
    expect(screen.queryByText('夏普')).toBeNull();
    expect(screen.queryByText('最大回撤')).toBeNull();
  });

  it('部分组合有值时仍渲染该行，缺值组合显示占位符 —', () => {
    const portfolios = [
      createPortfolio('组合 A', { cagr: 0.08, sharpe: 1.5 }),
      createPortfolio('组合 B', { cagr: 0.06 }),
    ];

    render(<MetricRowsTable rows={ROWS.slice(0, 2)} portfolios={portfolios as never} />);

    screen.getByText('1.50');
    expect(screen.getAllByText('—').length).toBe(1);
  });
});
