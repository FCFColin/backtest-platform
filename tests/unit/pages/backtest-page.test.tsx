import { describe, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('react-i18next', async () => (await import('../../helpers/i18nMock.js')).i18nMock);
vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

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
vi.mock('../../../packages/frontend/src/store/backtestStore.js', () => ({
  useBacktestStore: (
    selector: (s: {
      isLoading: boolean;
      portfolios: unknown[];
      setHasLoadedFromShare: () => void;
    }) => unknown,
  ) =>
    selector({
      isLoading: false,
      portfolios: pageState.portfolios,
      setHasLoadedFromShare: vi.fn(),
    }),
}));
vi.mock('../../../packages/frontend/src/pages/backtest/BacktestResults.js', () => ({
  ResultsContent: () => <div data-testid="backtest-results" />,
}));

import BacktestPage from '../../../packages/frontend/src/pages/backtest/BacktestPage.js';

describe('BacktestPage (smoke)', () => {
  beforeEach(() => {
    pageState.portfolios = [{ name: 'SPY', assets: [] }];
  });

  it('happy path: 装配标题与全部面板 slot', async () => {
    render(<BacktestPage />);
    screen.getByTestId('page-hero');
    await waitFor(() => screen.getByTestId('backtest-params'));
    await waitFor(() => screen.getByTestId('portfolio-editor'));
    await waitFor(() => screen.getByTestId('backtest-run'));
    await waitFor(() => screen.getByTestId('backtest-results'));
  });

  it('edge path: 空组合状态下仍渲染标题不崩溃', () => {
    pageState.portfolios = [];
    render(<BacktestPage />);
    screen.getByTestId('page-hero');
  });
});
