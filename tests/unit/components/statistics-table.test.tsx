/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatisticsTable from '../../../packages/frontend/src/components/StatisticsTable.js';

vi.mock('@backtest/shared', () => ({
  CHART_COLORS: ['#8884d8', '#82ca9d', '#ffc658'],
}));

vi.mock('../../../packages/frontend/src/i18n/index.js', () => ({
  default: { t: (key: string) => key },
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

function createPortfolio(name: string, stats: Record<string, number | undefined>) {
  return { name, statistics: stats };
}

describe('StatisticsTable', () => {
  it('渲染数据', () => {
    const portfolios = [
      createPortfolio('投资组合 A', { cagr: 0.08, sharpe: 1.5, maxDrawdown: -0.15 }),
      createPortfolio('投资组合 B', { cagr: 0.06, sharpe: 1.2, maxDrawdown: -0.2 }),
    ];

    render(<StatisticsTable portfolios={portfolios as never} />);
    expect(screen.getByText('components.statisticsTable.title')).toBeTruthy();
    expect(screen.getByText('投资组合 A')).toBeTruthy();
    expect(screen.getByText('投资组合 B')).toBeTruthy();
    expect(screen.getByText('8.00%')).toBeTruthy();
    expect(screen.getByText('6.00%')).toBeTruthy();
  });

  it('无数据显示占位文本', () => {
    render(<StatisticsTable portfolios={[]} />);
    expect(screen.getByText('components.statisticsTable.noData')).toBeTruthy();
  });

  it('compact 模式只显示核心指标', () => {
    const portfolios = [
      createPortfolio('投资组合 A', { cagr: 0.08, sharpe: 1.5, maxDrawdown: -0.15 }),
    ];

    render(<StatisticsTable portfolios={portfolios as never} compact />);
    expect(screen.getByText('components.statisticsTable.groups.core')).toBeTruthy();
    expect(screen.queryByText('components.statisticsTable.groups.return')).toBeNull();
  });

  it('处理部分统计为 undefined 时使用占位符', () => {
    const portfolios = [
      createPortfolio('投资组合 A', { cagr: 0.08, sharpe: 1.5 }),
      createPortfolio('投资组合 B', { cagr: 0.06 }),
    ];

    render(<StatisticsTable portfolios={portfolios as never} />);
    expect(screen.getByText('8.00%')).toBeTruthy();
    expect(screen.getByText('6.00%')).toBeTruthy();
    expect(screen.getByText('1.50')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
