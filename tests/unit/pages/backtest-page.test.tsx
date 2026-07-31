/**
 * @vitest-environment happy-dom
 *
 * BacktestPage 冒烟测试（P0-02 T16）。
 * 企业理由：页面入口组件负责将 useBacktestPageState 状态装配进 ComputeToolShell，
 * 子面板（参数表单/组合编辑器/工具栏/结果区）任意一个导入失败都会导致整页白屏。
 * 冒烟测试验证页面装配链路完整、标题与各面板 slot 正确渲染，防止重构破坏页面挂载。
 *
 * 策略：mock 掉承载副作用与重依赖的 hook 及叶子组件，保留 ComputeToolShell 真实渲染，
 * 断言标题（i18n key 透传）与各 slot stub 出现。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

// 可变状态：让 happy/edge 用例切换 portfolios 取值
const pageState = vi.hoisted(() => ({
  portfolios: [{ name: 'SPY', assets: [] }] as unknown[],
}));

vi.mock('../../../packages/frontend/src/pages/backtest/hooks/useBacktestPageState.js', () => ({
  useBacktestPageState: () => ({
    t: (key: string) => key,
    seoProps: { desc: '', features: [], related: [], relatedLabel: '' },
    runBacktest: () => {},
    parameters: {},
    portfolios: pageState.portfolios,
    showSaveInput: false,
    setShowSaveInput: () => {},
    configName: '',
    setConfigName: () => {},
    showLoadList: false,
    savedConfigs: [],
    handleSaveConfig: async () => {},
    handleOpenLoadList: async () => {},
    handleLoadConfig: () => {},
    handleDeleteConfig: async () => {},
    handleShareLink: async () => {},
  }),
}));

vi.mock('../../../packages/frontend/src/components/BacktestParamsForm.js', () => ({
  default: () => <div data-testid="backtest-params" />,
}));
vi.mock('../../../packages/frontend/src/components/PortfolioEditor.js', () => ({
  default: () => <div data-testid="portfolio-editor" />,
}));
vi.mock('../../../packages/frontend/src/pages/backtest/BacktestToolbar.js', () => ({
  BacktestToolbar: () => <div data-testid="backtest-toolbar" />,
}));
vi.mock('../../../packages/frontend/src/pages/backtest/BacktestResults.js', () => ({
  ResultsContent: () => <div data-testid="backtest-results" />,
}));
vi.mock('../../../packages/frontend/src/pages/backtest/BacktestHero.js', () => ({
  BacktestHero: () => <div data-testid="backtest-hero" />,
}));

import BacktestPage from '../../../packages/frontend/src/pages/backtest/BacktestPage.js';

describe('BacktestPage (smoke)', () => {
  beforeEach(() => {
    pageState.portfolios = [{ name: 'SPY', assets: [] }];
  });

  it('happy path: 装配标题与全部面板 slot', async () => {
    render(<BacktestPage />);
    expect(screen.getByTestId('backtest-hero')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('backtest-params')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('portfolio-editor')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('backtest-toolbar')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('backtest-results')).toBeTruthy());
  });

  it('edge path: 空组合状态下仍渲染标题不崩溃', () => {
    pageState.portfolios = [];
    render(<BacktestPage />);
    expect(screen.getByTestId('backtest-hero')).toBeTruthy();
  });
});
