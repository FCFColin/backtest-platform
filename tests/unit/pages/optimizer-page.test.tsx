/**
 * @vitest-environment happy-dom
 *
 * OptimizerPage 冒烟测试（P0-02 T16）。
 * 企业理由：优化器页面入口将 useOptimizerState 状态装配进 ComputeToolShell，
 * 参数/结果面板任一导入失败即整页白屏。冒烟测试验证装配链路与标题渲染。
 *
 * 策略：mock 副作用 hook 与叶子组件，保留 ComputeToolShell 真实渲染，
 * 断言标题（i18n key 透传）与参数/结果 slot stub 出现。
 * useNavigate 由 vitest workspace 全局别名（tests/mocks/react-router-dom.tsx）提供。
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

// 可变状态：让 happy/edge 用例切换 tickers 取值
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
    expect(screen.getByText('optimizer.title')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('optimizer-params')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('optimizer-results')).toBeTruthy());
  });

  it('edge path: 空 tickers 状态下仍渲染标题不崩溃', () => {
    pageState.tickers = [];
    render(<OptimizerPage />);
    expect(screen.getByText('optimizer.title')).toBeTruthy();
  });
});
