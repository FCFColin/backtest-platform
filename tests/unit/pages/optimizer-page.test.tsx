import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

const pageState = vi.hoisted(() => ({
  tickers: ['SPY', 'BND'] as string[],
}));

vi.mock('../../../packages/frontend/src/pages/optimizer/OptimizerUtils.js', () => ({
  useOptimizerState: () => ({ tickers: pageState.tickers }) as unknown,
}));

vi.mock('../../../packages/frontend/src/pages/optimizer/OptimizerParams.js', () => ({
  OptimizerParams: () => <div data-testid="optimizer-params" />,
}));
vi.mock('../../../packages/frontend/src/pages/optimizer/OptimizerResults.js', () => ({
  OptimizerResults: () => <div data-testid="optimizer-results" />,
}));

import OptimizerPage from '../../../packages/frontend/src/pages/optimizer/OptimizerPage.js';

describe('OptimizerPage (smoke)', () => {
  beforeEach(() => {
    pageState.tickers = ['SPY', 'BND'];
  });

  it('happy path: 装配标题与参数/结果面板 slot', async () => {
    render(<OptimizerPage />);
    expect(screen.getByText('nav.portfolioOptimize')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('optimizer-params')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('optimizer-results')).toBeTruthy());
  });

  it('edge path: 空 tickers 状态下仍渲染标题不崩溃', () => {
    pageState.tickers = [];
    render(<OptimizerPage />);
    expect(screen.getByText('nav.portfolioOptimize')).toBeTruthy();
  });
});
