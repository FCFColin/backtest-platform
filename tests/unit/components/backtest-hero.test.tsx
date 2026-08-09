import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BacktestHero } from '../../../packages/frontend/src/pages/backtest/BacktestHero.js';

vi.mock('react-i18next', async () => {
  const { i18nMock, t } = await import('../../helpers/i18nMock.js');
  const tOverride = (key: string) =>
    ['backtest.hero.model.items', 'backtest.hero.inspect.items'].includes(key)
      ? ['Item 1', 'Item 2', 'Item 3']
      : t(key);
  return { ...i18nMock, useTranslation: () => ({ ...i18nMock.useTranslation(), t: tOverride }) };
});

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const HERO_DESCRIPTION =
  'This platform is a portfolio backtesting tool supporting ETFs, stocks, funds, synthetic tickers, and custom sequences. Compare multiple portfolios over the same historical period, test rebalancing rules, and simulate cashflow contributions or withdrawals.';

beforeEach(() => {
  localStorage.clear();
});

describe('BacktestHero', () => {
  it('渲染标题', () => {
    render(<BacktestHero />);
    expect(screen.getByText('nav.portfolioBacktest')).toBeTruthy();
  });

  it('渲染副标题', () => {
    render(<BacktestHero />);
    expect(
      screen.getByText(
        'Professional tools for backtesting portfolios, asset allocations, and retirement cashflows',
      ),
    ).toBeTruthy();
  });

  it('前 3 次访问默认展开', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    expect(screen.getByText(HERO_DESCRIPTION)).toBeTruthy();
  });

  it('第 4 次访问默认折叠', () => {
    localStorage.setItem('backtest-hero-visit-count', '3');
    render(<BacktestHero />);
    expect(screen.queryByText(HERO_DESCRIPTION)).not.toBeTruthy();
  });

  it('点击展开按钮显示详情', () => {
    localStorage.setItem('backtest-hero-visit-count', '3');
    render(<BacktestHero />);
    const expandBtn = screen.getByText('Show Intro');
    fireEvent.click(expandBtn);
    expect(screen.getByText(HERO_DESCRIPTION)).toBeTruthy();
  });

  it('点击折叠按钮隐藏详情', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    const collapseBtn = screen.getByText('Hide Intro');
    fireEvent.click(collapseBtn);
    expect(screen.queryByText(HERO_DESCRIPTION)).not.toBeTruthy();
  });

  it('展开时显示三栏能力卡片标题', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    expect(screen.getByText('What You Can Model')).toBeTruthy();
    expect(screen.getByText('Metrics You Can Inspect')).toBeTruthy();
    expect(screen.getByText('Related Research Tools')).toBeTruthy();
  });

  it('展开时显示研究工具链接', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    expect(screen.getByText('nav.monteCarlo')).toBeTruthy();
    expect(screen.getByText('nav.portfolioOptimize')).toBeTruthy();
    expect(screen.getByText('nav.efficientFrontier')).toBeTruthy();
  });

  it('每次渲染增加访问计数', () => {
    localStorage.setItem('backtest-hero-visit-count', '5');
    render(<BacktestHero />);
    expect(localStorage.getItem('backtest-hero-visit-count')).toBe('6');
  });
});
