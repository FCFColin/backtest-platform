/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BacktestHero } from '../../../packages/frontend/src/pages/backtest/BacktestHero.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === 'backtest.hero.model.items' || key === 'backtest.hero.inspect.items') {
        return ['Item 1', 'Item 2', 'Item 3'];
      }
      if (!params) return key;
      return key;
    },
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('BacktestHero', () => {
  it('渲染标题', () => {
    render(<BacktestHero />);
    expect(screen.getByText('backtest.hero.title')).toBeTruthy();
  });

  it('渲染副标题', () => {
    render(<BacktestHero />);
    expect(screen.getByText('backtest.hero.subtitle')).toBeTruthy();
  });

  it('前 3 次访问默认展开', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    expect(screen.getByText('backtest.hero.description')).toBeTruthy();
  });

  it('第 4 次访问默认折叠', () => {
    localStorage.setItem('backtest-hero-visit-count', '3');
    render(<BacktestHero />);
    expect(screen.queryByText('backtest.hero.description')).not.toBeTruthy();
  });

  it('点击展开按钮显示详情', () => {
    localStorage.setItem('backtest-hero-visit-count', '3');
    render(<BacktestHero />);
    const expandBtn = screen.getByText('backtest.hero.expand');
    fireEvent.click(expandBtn);
    expect(screen.getByText('backtest.hero.description')).toBeTruthy();
  });

  it('点击折叠按钮隐藏详情', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    const collapseBtn = screen.getByText('backtest.hero.collapse');
    fireEvent.click(collapseBtn);
    expect(screen.queryByText('backtest.hero.description')).not.toBeTruthy();
  });

  it('展开时显示三栏能力卡片标题', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    expect(screen.getByText('backtest.hero.model.title')).toBeTruthy();
    expect(screen.getByText('backtest.hero.inspect.title')).toBeTruthy();
    expect(screen.getByText('backtest.hero.tools.title')).toBeTruthy();
  });

  it('展开时显示研究工具链接', () => {
    localStorage.setItem('backtest-hero-visit-count', '0');
    render(<BacktestHero />);
    expect(screen.getByText('backtest.hero.tools.mc')).toBeTruthy();
    expect(screen.getByText('backtest.hero.tools.opt')).toBeTruthy();
    expect(screen.getByText('backtest.hero.tools.ef')).toBeTruthy();
  });

  it('每次渲染增加访问计数', () => {
    localStorage.setItem('backtest-hero-visit-count', '5');
    render(<BacktestHero />);
    expect(localStorage.getItem('backtest-hero-visit-count')).toBe('6');
  });
});
