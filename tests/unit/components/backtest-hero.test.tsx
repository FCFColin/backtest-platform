import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BacktestHero } from '../../../packages/frontend/src/pages/backtest/BacktestPage.js';

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
    screen.getByText('nav.portfolioBacktest');
  });

  it('渲染副标题', () => {
    render(<BacktestHero />);
    screen.getByText(
      'Professional tools for backtesting portfolios, asset allocations, and retirement cashflows',
    );
  });

  it('首次访问默认展开', () => {
    render(<BacktestHero />);
    screen.getByText(HERO_DESCRIPTION);
  });

  it('记住折叠选择，重新渲染仍折叠', () => {
    const first = render(<BacktestHero />);
    fireEvent.click(first.getByText('Hide Intro'));
    first.unmount();
    render(<BacktestHero />);
    expect(screen.queryByText(HERO_DESCRIPTION)).not.toBeTruthy();
  });

  it('记住展开选择，重新渲染仍展开', () => {
    localStorage.setItem('backtest-hero-expanded', '0');
    const first = render(<BacktestHero />);
    fireEvent.click(first.getByText('Show Intro'));
    first.unmount();
    render(<BacktestHero />);
    screen.getByText(HERO_DESCRIPTION);
  });

  it('点击展开按钮显示详情', () => {
    localStorage.setItem('backtest-hero-expanded', '0');
    render(<BacktestHero />);
    const expandBtn = screen.getByText('Show Intro');
    fireEvent.click(expandBtn);
    screen.getByText(HERO_DESCRIPTION);
  });

  it('点击折叠按钮隐藏详情', () => {
    render(<BacktestHero />);
    const collapseBtn = screen.getByText('Hide Intro');
    fireEvent.click(collapseBtn);
    expect(screen.queryByText(HERO_DESCRIPTION)).not.toBeTruthy();
  });

  it('展开时显示三栏能力卡片标题', () => {
    render(<BacktestHero />);
    screen.getByText('What You Can Model');
    screen.getByText('Metrics You Can Inspect');
    screen.getByText('Related Research Tools');
  });

  it('展开时显示研究工具链接', () => {
    render(<BacktestHero />);
    screen.getByText('nav.monteCarlo');
    screen.getByText('nav.portfolioOptimize');
    screen.getByText('nav.efficientFrontier');
  });
});
